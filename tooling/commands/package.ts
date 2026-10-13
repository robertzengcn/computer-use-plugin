/**
 * package:build (design §2.2, §7.2): assemble an already-verified target
 * package — common plugin files plus the target's environment inputs and
 * notices — with a checksummed file manifest. Fails closed while the
 * target's upstream lock is unpinned; performs no dependency resolution and
 * no implicit native build.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import type { CommandResult } from '../cli.js';
import { sha256File } from '../release/hash.js';
import { publishStaging, stagingFor } from '../release/publish.js';

interface TargetPlan {
  readonly lockPath: string;
  readonly envFiles: readonly string[];
  readonly requiredPaths: readonly string[];
}

const WINDOWS: TargetPlan = {
  lockPath: join('adapters', 'windows', 'upstream.lock'),
  envFiles: [
    join('adapters', 'windows', 'launch-profile.json'),
    join('adapters', 'windows', 'tool-allowlist.json'),
    join('adapters', 'windows', 'uv.lock'),
    join('adapters', 'windows', 'upstream.lock'),
    join('adapters', 'windows', 'pyproject.toml'),
  ],
  // B06/E10: without the runnable package source the target cannot run; a pin
  // alone is metadata staging, not a delivered backend. Entrypoint must exist
  // for a launchable wheel/environment.
  requiredPaths: [
    join('adapters', 'windows', 'src', 'aifetchly_windows', '__init__.py'),
    join('adapters', 'windows', 'src', 'aifetchly_windows', 'entrypoint.py'),
  ],
};

const MACOS: TargetPlan = {
  lockPath: join('adapters', 'macos', 'ghost-os', 'upstream.lock'),
  envFiles: [
    join('adapters', 'macos', 'ghost-os', 'upstream.lock'),
    join('adapters', 'macos', 'ghost-os', 'tool-allowlist.json'),
  ],
  // E10: a pinned lock without the native executable is metadata staging, not a
  // deliverable. Helper source arrives with the P0-E/P3 selection; until then
  // packaging fails closed instead of reporting success.
  requiredPaths: [join('adapters', 'macos', 'ghost-os', 'helper')],
};

const COMMON_PLUGIN_FILES: readonly string[] = [
  join('plugin', 'manifest.json'),
  join('plugin', 'tools.md'),
  join('plugin', 'skills', 'computer-use.md'),
  'THIRD_PARTY_NOTICES',
];

async function fileExists(path: string): Promise<boolean> {
  return (await stat(path).catch(() => undefined)) !== undefined;
}

/** E10: validate the upstream lock against the canonical schema. */
function validateUpstreamLockShape(
  repoRoot: string,
  lock: unknown,
  lockPath: string,
): string | undefined {
  let schema: object;
  try {
    schema = JSON.parse(
      readFileSync(join(repoRoot, 'contracts', 'adapters', 'upstream-lock-v1.schema.json'), 'utf8'),
    ) as object;
  } catch {
    return undefined; // schema read errors surface via contracts:check
  }
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  if (!validate(lock)) {
    return `${lockPath} fails upstream-lock-v1: ${(validate.errors ?? [])
      .slice(0, 3)
      .map((e) => `${e.instancePath} ${e.message}`)
      .join('; ')}`;
  }
  return undefined;
}

async function copyTree(source: string, target: string, prefix: string, repoAnchor: string): Promise<string[]> {
  const copied: string[] = [];
  await mkdir(target, { recursive: true });
  const entries = await readdir(source, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const rel = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`;
    // N07: hostile checkout filenames (e.g. backslash spellings) never
    // escape the staging tree.
    if (rel.split('/').includes('..') || rel.split('\\').includes('..')) {
      throw new Error(`refusing to stage escaping path: ${rel}`);
    }
    if (isExcludedDeliverable(rel, entry.isDirectory())) {
      continue;
    }
    // E09: symlinks are never staged silently. A link resolving inside the
    // repository is materialized (copied bytes match the manifest hash); a
    // link escaping the repository fails the build instead of omitting the
    // file while required-path checks still see it.
    if (entry.isSymbolicLink()) {
      const realTarget = await realpath(join(source, entry.name)).catch(() => undefined);
      const relToRepo = realTarget === undefined ? '..' : relative(repoAnchor, realTarget);
      if (realTarget === undefined || escapesRepo(relToRepo)) {
        throw new Error(`refusing to stage escaping symlink: ${rel}`);
      }
      await copyFile(join(source, entry.name), join(target, entry.name));
      copied.push(rel);
      continue;
    }
    if (entry.isDirectory()) {
      copied.push(...(await copyTree(join(source, entry.name), join(target, entry.name), rel, repoAnchor)));
    } else if (entry.isFile()) {
      await copyFile(join(source, entry.name), join(target, entry.name));
      copied.push(rel);
    }
  }
  return copied;
}

/** True when a repo-relative path escapes the repository. */
function escapesRepo(rel: string): boolean {
  return rel === '' || rel.startsWith('..') || isAbsolute(rel);
}

// E03: development caches/bytecode are never deliverables. Excluded
// explicitly so an independent extraction scan finds neither unlisted files
// nor caches.
const EXCLUDED_DIRS = new Set([
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  '.ruff_cache',
  '.venv',
  'venv',
  '.git',
  'node_modules',
]);
const EXCLUDED_SUFFIXES = ['.pyc', '.pyo', '.pyd', '~'];
const EXCLUDED_BASENAMES = new Set(['.DS_Store', 'Thumbs.db']);

function isExcludedDeliverable(rel: string, isDir: boolean): boolean {
  const parts = rel.split('/');
  for (const part of parts) {
    if (EXCLUDED_DIRS.has(part)) {
      return true;
    }
  }
  if (isDir) {
    return false;
  }
  const base = parts[parts.length - 1] ?? '';
  if (EXCLUDED_BASENAMES.has(base)) {
    return true;
  }
  return EXCLUDED_SUFFIXES.some((suffix) => base.endsWith(suffix));
}

export async function packageBuild(
  repoRoot: string,
  target: string,
  outRoot: string,
): Promise<CommandResult> {
  const plan = target === 'win32-x64' ? WINDOWS : target === 'darwin-arm64' ? MACOS : undefined;
  if (plan === undefined) {
    return { outcome: 'invalidArgs', message: `unsupported --target ${target}` };
  }
  const lock = JSON.parse(await readFile(join(repoRoot, plan.lockPath), 'utf8')) as {
    status?: string;
    selectedRevision?: string | null;
    sourceSha256?: string | null;
    dependencyLockSha256?: string | null;
    dependencyLock?: string | null;
    pythonVersion?: string | null;
  };
  // E10: apply the full lock-shape/digest validation (same as backendPrepare):
  // metadata staging alone must never report success.
  const shapeError = validateUpstreamLockShape(repoRoot, lock, plan.lockPath);
  if (shapeError !== undefined) {
    return { outcome: 'missingPrerequisites', message: shapeError };
  }
  if (lock.status !== 'pinned' || !lock.selectedRevision) {
    return {
      outcome: 'missingPrerequisites',
      message: `${plan.lockPath} is '${lock.status ?? 'malformed'}': package:build assembles only pinned, verified targets (the spike must record the revision first)`,
    };
  }
  if (!/^[0-9a-f]{40}$/i.test(lock.selectedRevision)) {
    return {
      outcome: 'missingPrerequisites',
      message: `${plan.lockPath} selectedRevision must be a 40-character commit SHA (got ${JSON.stringify(lock.selectedRevision)}) — a pin alone is not a verified closure`,
    };
  }
  if (target === 'win32-x64') {
    if (!lock.sourceSha256 || !lock.dependencyLockSha256 || !lock.pythonVersion) {
      return {
        outcome: 'missingPrerequisites',
        message: `${plan.lockPath} is pinned but lacks sourceSha256/dependencyLockSha256/pythonVersion: the spike must record the full closure (E10)`,
      };
    }
    const uvLockPath = join(repoRoot, 'adapters', 'windows', 'uv.lock');
    const actualDigest = await sha256File(uvLockPath).catch(() => undefined);
    if (actualDigest === undefined) {
      return { outcome: 'missingPrerequisites', message: 'adapters/windows/uv.lock missing — cannot verify dependency closure' };
    }
    if (actualDigest !== lock.dependencyLockSha256) {
      return {
        outcome: 'missingPrerequisites',
        message: `${plan.lockPath} dependencyLockSha256 does not match the current uv.lock — resync before packaging`,
      };
    }
  }
  if (target === 'darwin-arm64') {
    const macLock = lock as { sourceSha256?: string | null; dependencyLock?: string | null };
    if (!macLock.sourceSha256) {
      return {
        outcome: 'missingPrerequisites',
        message: `${plan.lockPath} is pinned but lacks sourceSha256: the P0-E spike must record the helper source closure (E10)`,
      };
    }
  }

  // B07: build into a fresh staging directory. N08: unique staging per
  // call, and recoverable publication below — staging failures clean only
  // their own staging and preserve the previous packageDir.
  const packageDir = join(outRoot, `package-${target}-${lock.selectedRevision.slice(0, 10)}`);
  const stagingDir = stagingFor(packageDir);
  await mkdir(stagingDir, { recursive: true });

  const included: { path: string; role: string; sha256: string; bytes: number }[] = [];
  // N07: every staged path is containment-checked before any directory is
  // created or file is copied — traversal segments (including backslash
  // spellings from hostile checkout filenames) never escape staging.
  const checkStagedPath = (relative: string): string | undefined => {
    const normalized = relative.replaceAll('\\', '/');
    if (isAbsolute(normalized) || normalized.split('/').includes('..') || normalized.length === 0) {
      return `refusing to stage escaping path: ${relative}`;
    }
    return undefined;
  };
  const addFile = async (relative: string, role: string): Promise<boolean> => {
    const rejected = checkStagedPath(relative);
    if (rejected !== undefined) {
      throw new Error(rejected);
    }
    const absolute = join(repoRoot, relative);
    if (!(await fileExists(absolute))) {
      return false;
    }
    const destination = join(stagingDir, relative.replaceAll('\\', '/'));
    await mkdir(join(destination, '..'), { recursive: true });
    await copyFile(absolute, destination);
    included.push({
      path: relative.replaceAll('\\', '/'),
      role,
      sha256: await sha256File(absolute),
      bytes: (await stat(absolute)).size,
    });
    return true;
  };

  for (const relative of COMMON_PLUGIN_FILES) {
    try {
      if (!(await addFile(relative, 'plugin'))) {
        await rm(stagingDir, { recursive: true, force: true }).catch(() => undefined);
        return {
          outcome: 'failed',
          message: `common plugin file missing: ${relative}`,
        };
      }
    } catch (error) {
      await rm(stagingDir, { recursive: true, force: true }).catch(() => undefined);
      return { outcome: 'failed', message: `staging rejected: ${(error as Error).message}` };
    }
  }
  for (const relative of plan.envFiles) {
    try {
      if (!(await addFile(relative, 'env-input'))) {
        await rm(stagingDir, { recursive: true, force: true }).catch(() => undefined);
        return {
          outcome: 'failed',
          message: `target environment input missing: ${relative} (run the spike pin first)`,
        };
      }
    } catch (error) {
      await rm(stagingDir, { recursive: true, force: true }).catch(() => undefined);
      return { outcome: 'failed', message: `staging rejected: ${(error as Error).message}` };
    }
  }
  for (const required of plan.requiredPaths) {
    if (!(await fileExists(join(repoRoot, required))) || !(await fileExists(join(repoRoot, 'adapters', 'windows', 'pyproject.toml')))) {
      await rm(stagingDir, { recursive: true, force: true }).catch(() => undefined);
      return {
        outcome: 'failed',
        message: `runnable backend source missing: ${required} — a pinned lock without the package is not a deliverable (B06)`,
      };
    }
  }
  // The backend package source ships with the closure so extraction is
  // launchable through the declared profile (B06).
  // E03: every delivered backend byte is enumerated in files/roles/sizes/digest;
  // changing any delivered source changes the digest.
  // N07/E09: tree copies are containment- and symlink-checked inside
  // copyTree; failures clean staging and preserve the previous candidate.
  const repoAnchor = await realpath(repoRoot).catch(() => repoRoot);
  if (target === 'win32-x64') {
    let srcCopied: string[];
    try {
      srcCopied = await copyTree(
        join(repoRoot, 'adapters', 'windows', 'src'),
        join(stagingDir, 'adapters', 'windows', 'src'),
        '',
        repoAnchor,
      );
    } catch (error) {
      await rm(stagingDir, { recursive: true, force: true }).catch(() => undefined);
      return { outcome: 'failed', message: `staging rejected: ${(error as Error).message}` };
    }
    for (const rel of srcCopied) {
      const repoRel = `adapters/windows/src/${rel}`;
      const absolute = join(repoRoot, repoRel);
      included.push({
        path: repoRel,
        role: 'backend',
        sha256: await sha256File(absolute),
        bytes: (await stat(absolute)).size,
      });
    }
  }
  // Skills tree may hold more than the known file; copy anything extra.
  const skillsDir = join(repoRoot, 'plugin', 'skills');
  if (await fileExists(skillsDir)) {
    let extraCopied: string[];
    try {
      extraCopied = await copyTree(skillsDir, join(stagingDir, 'plugin', 'skills'), '', repoAnchor);
    } catch (error) {
      await rm(stagingDir, { recursive: true, force: true }).catch(() => undefined);
      return { outcome: 'failed', message: `staging rejected: ${(error as Error).message}` };
    }
    for (const extra of extraCopied) {
      const absolute = join(skillsDir, extra);
      if (!included.some((entry) => entry.path === `plugin/skills/${extra}`)) {
        included.push({
          path: `plugin/skills/${extra}`,
          role: 'plugin',
          sha256: await sha256File(absolute),
          bytes: (await stat(absolute)).size,
        });
      }
    }
  }

  included.sort((a, b) => a.path.localeCompare(b.path));
  const digest = createHash('sha256')
    .update(JSON.stringify(included.map(({ path, sha256 }) => ({ path, sha256 }))))
    .digest('hex');
  const manifest = {
    schemaVersion: 1,
    target,
    upstreamRevision: lock.selectedRevision,
    roles: included.some((entry) => entry.role === 'backend')
      ? ['plugin', 'env-input', 'backend']
      : ['plugin', 'env-input'],
    files: included,
    digest,
    signed: false,
    notes:
      'signing status derives from release evidence, never from packaging (B06): ' +
      (target === 'darwin-arm64'
        ? 'mac-native requires a verified signing identity at release:verify'
        : 'windows environment integrity is covered by lock hashes; code signing is not claimed'),
  };
  await writeFile(join(stagingDir, 'package-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  // N08: recoverable publish — previous packageDir moved aside, restored on
  // final-rename failure instead of deleted.
  const published = await publishStaging(stagingDir, packageDir);
  if (published.outcome !== 'ok') {
    return { outcome: 'failed', message: `package ${published.message}` };
  }

  return {
    outcome: 'ok',
    message: [
      `package assembled for ${target} @ ${lock.selectedRevision.slice(0, 10)}: ${included.length} files`,
      `dir: ${packageDir}`,
      `digest: ${digest}`,
    ].join('\n'),
    result: manifest,
  };
}

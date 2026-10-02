/**
 * package:build (design §2.2, §7.2): assemble an already-verified target
 * package — common plugin files plus the target's environment inputs and
 * notices — with a checksummed file manifest. Fails closed while the
 * target's upstream lock is unpinned; performs no dependency resolution and
 * no implicit native build.
 */
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CommandResult } from '../cli.js';
import { sha256File } from '../release/hash.js';

interface TargetPlan {
  readonly lockPath: string;
  readonly envFiles: readonly string[];
}

const WINDOWS: TargetPlan = {
  lockPath: join('adapters', 'windows', 'upstream.lock'),
  envFiles: [
    join('adapters', 'windows', 'launch-profile.json'),
    join('adapters', 'windows', 'tool-allowlist.json'),
    join('adapters', 'windows', 'uv.lock'),
    join('adapters', 'windows', 'upstream.lock'),
  ],
};

const MACOS: TargetPlan = {
  lockPath: join('adapters', 'macos', 'ghost-os', 'upstream.lock'),
  envFiles: [
    join('adapters', 'macos', 'ghost-os', 'upstream.lock'),
    join('adapters', 'macos', 'ghost-os', 'tool-allowlist.json'),
  ],
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

async function copyTree(source: string, target: string, prefix: string): Promise<string[]> {
  const copied: string[] = [];
  await mkdir(target, { recursive: true });
  const entries = await readdir(source, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const rel = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      copied.push(...(await copyTree(join(source, entry.name), join(target, entry.name), rel)));
    } else if (entry.isFile()) {
      await copyFile(join(source, entry.name), join(target, entry.name));
      copied.push(rel);
    }
  }
  return copied;
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
  };
  if (lock.status !== 'pinned' || !lock.selectedRevision) {
    return {
      outcome: 'missingPrerequisites',
      message: `${plan.lockPath} is '${lock.status ?? 'malformed'}': package:build assembles only pinned, verified targets (the spike must record the revision first)`,
    };
  }

  const packageDir = join(outRoot, `package-${target}-${lock.selectedRevision.slice(0, 10)}`);
  await mkdir(packageDir, { recursive: true });

  const included: { path: string; role: string; sha256: string; bytes: number }[] = [];
  const addFile = async (relative: string, role: string): Promise<boolean> => {
    const absolute = join(repoRoot, relative);
    if (!(await fileExists(absolute))) {
      return false;
    }
    const destination = join(packageDir, relative.replaceAll('\\', '/'));
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
    if (!(await addFile(relative, 'plugin'))) {
      return {
        outcome: 'failed',
        message: `common plugin file missing: ${relative}`,
      };
    }
  }
  for (const relative of plan.envFiles) {
    if (!(await addFile(relative, 'env-input'))) {
      return {
        outcome: 'failed',
        message: `target environment input missing: ${relative} (run the spike pin first)`,
      };
    }
  }
  // Skills tree may hold more than the known file; copy anything extra.
  const skillsDir = join(repoRoot, 'plugin', 'skills');
  if (await fileExists(skillsDir)) {
    for (const extra of await copyTree(skillsDir, join(packageDir, 'plugin', 'skills'), '')) {
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
    roles: ['plugin', 'env-input'],
    files: included,
    digest,
    signed: target !== 'darwin-arm64',
    notes:
      target === 'darwin-arm64'
        ? 'unsigned candidate: signing/notarization is the P3 release step; release:verify rejects a mac-native artifact without a signing identity'
        : 'executable permissions and signatures must survive extraction (CU-PLUGIN-13)',
  };
  await writeFile(join(packageDir, 'package-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

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

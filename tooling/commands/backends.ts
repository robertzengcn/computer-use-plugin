/**
 * Platform-environment commands (design §2.2): backend:prepare / backend:test
 * / model:prepare. Each fails closed while its lock is unpinned; when pinned
 * on the matching platform it drives uv through the bounded subprocess
 * runner — never a floating dependency resolution.
 */
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { buildArgv, runProcess } from '../processes/run.js';
import type { CommandResult } from '../cli.js';
import { sha256File } from '../release/hash.js';

interface UpstreamLock {
  readonly status?: string;
  readonly selectedRevision?: string | null;
  readonly pythonVersion?: string | null;
  readonly sourceSha256?: string | null;
  readonly dependencyLockSha256?: string | null;
}

async function readLock(repoRoot: string, relative: string): Promise<UpstreamLock> {
  return JSON.parse(await readFile(join(repoRoot, relative), 'utf8')) as UpstreamLock;
}

/** Validate a lock against the canonical upstream-lock-v1 (M02). */
function validateLockShape(repoRoot: string, lock: UpstreamLock, lockPath: string): string | undefined {
  const schema = JSON.parse(
    readFileSync(join(repoRoot, 'contracts', 'adapters', 'upstream-lock-v1.schema.json'), 'utf8'),
  ) as object;
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

// Forward-slash literals so comparisons and subprocess cwd construction are
// platform-independent (B13); runProcess cwd accepts them on every OS we build on.
const TARGET_LOCK: Record<string, string> = {
  'win32-x64': 'adapters/windows/upstream.lock',
  'darwin-arm64': 'adapters/macos/ghost-os/upstream.lock',
};
const TARGET_DIR: Record<string, string> = {
  'win32-x64': 'adapters/windows',
  'darwin-arm64': 'adapters/macos',
};

export async function backendPrepare(
  repoRoot: string,
  target: string,
): Promise<CommandResult> {
  const lockPath = TARGET_LOCK[target];
  const dir = TARGET_DIR[target];
  if (lockPath === undefined || dir === undefined) {
    return { outcome: 'invalidArgs', message: `unsupported --target ${target}` };
  }
  const lock = await readLock(repoRoot, lockPath);
  const shapeError = validateLockShape(repoRoot, lock, lockPath);
  if (shapeError !== undefined) {
    return { outcome: 'missingPrerequisites', message: shapeError };
  }
  if (lock.status !== 'pinned' || !lock.selectedRevision) {
    return {
      outcome: 'missingPrerequisites',
      message: `${dir}/upstream.lock is '${lock.status ?? 'malformed'}': the P0-C/P0-E spike must pin the exact revision before the environment can be synchronized`,
    };
  }
  // M02: a pinned lock must carry its source digest, and the recorded
  // dependency-lock digest must match the actual uv.lock bytes.
  if (target === 'win32-x64') {
    if (!lock.sourceSha256 || !lock.dependencyLockSha256) {
      return {
        outcome: 'missingPrerequisites',
        message: `${lockPath} is pinned but lacks sourceSha256/dependencyLockSha256: the spike must record the full closure`,
      };
    }
    const uvLockPath = join(repoRoot, 'adapters', 'windows', 'uv.lock');
    const actualDigest = await sha256File(uvLockPath).catch(() => undefined);
    if (actualDigest === undefined) {
      return { outcome: 'missingPrerequisites', message: 'adapters/windows/uv.lock missing' };
    }
    if (actualDigest !== lock.dependencyLockSha256) {
      return {
        outcome: 'missingPrerequisites',
        message: `${lockPath} dependencyLockSha256 does not match the current uv.lock — resync the lock digest or run uv lock`,
      };
    }
  }
  if (target === 'darwin-arm64') {
    return {
      outcome: 'missingPrerequisites',
      message: 'macOS helper environment assembly is the P3 deliverable; the P0-E decision must be recorded first',
    };
  }
  const result = await runProcess({
    argv: ['uv', 'sync', '--locked'],
    cwd: join(repoRoot, dir),
    timeoutMs: 10 * 60_000,
  });
  if (result.outcome !== 'ok') {
    return {
      outcome: 'failed',
      message: `uv sync --locked failed (exit ${result.exitCode}): ${result.stderr.slice(0, 400)}`,
    };
  }
  return {
    outcome: 'ok',
    message: `synchronized ${dir} from its lock (revision ${lock.selectedRevision}); no MCP launched`,
  };
}

export async function backendTest(
  repoRoot: string,
  target: string,
  suite: 'unit' | 'native',
  allowInput: boolean,
): Promise<CommandResult> {
  const dir = TARGET_DIR[target];
  if (dir === undefined) {
    return { outcome: 'invalidArgs', message: `unsupported --target ${target}` };
  }
  if (suite === 'native') {
    if (!allowInput) {
      return { outcome: 'invalidArgs', message: 'native tests require --allow-input (design §2.2)' };
    }
    if (target !== 'win32-x64') {
      return {
        outcome: 'missingPrerequisites',
        message: 'native mac tests are the P3 deliverable after the P0-E decision',
      };
    }
    const lock = await readLock(repoRoot, TARGET_LOCK[target]!);
    if (lock.status !== 'pinned') {
      return {
        outcome: 'missingPrerequisites',
        message: 'native tests need the pinned Windows environment (backend:prepare first)',
      };
    }
    const probe = await runProcess({
      argv: buildArgv({ kind: 'uv-python', project: dir, module: 'aifetchly_windows.entrypoint' }),
      cwd: repoRoot,
      timeoutMs: 30_000,
    });
    return {
      outcome: 'failed',
      message: `native harness pending P1 (entrypoint probe exit ${probe.exitCode}); a controlled test window is required and none is configured`,
    };
  }
  if (target === 'darwin-arm64') {
    return {
      outcome: 'missingPrerequisites',
      message: 'Swift package tests activate when the P0-E decision pins the helper source',
    };
  }
  const result = await runProcess({
    argv: ['uv', 'run', '--locked', 'python', '-m', 'pytest', '-q'],
    cwd: join(repoRoot, dir),
    timeoutMs: 5 * 60_000,
  });
  if (result.outcome !== 'ok') {
    return {
      outcome: 'failed',
      message: `pytest failed (exit ${result.exitCode}): ${result.stdout.slice(-400)}${result.stderr.slice(-200)}`,
    };
  }
  return { outcome: 'ok', message: `unit tests passed in ${dir}: ${result.stdout.trim().split('\n').pop() ?? ''}` };
}

interface ModelsLock {
  readonly status?: string;
  readonly models?: readonly {
    readonly modelId?: string;
    readonly revision?: string | null;
    readonly weightsFiles?: readonly { readonly path: string; readonly sha256?: string; readonly bytes?: number }[] | null;
  }[];
}

export interface ModelCacheVerification {
  readonly config: string;
  readonly cacheDir: string;
  readonly expectedFiles: readonly { path: string; sha256: string | undefined }[];
  readonly present: readonly string[];
  readonly missing: readonly string[];
  readonly hashMismatches: readonly string[];
}

/** M04: verify the configured cache against the approved lock. Never
 * downloads — fetching weights is the maintainer's explicit action (§6.6). */
export async function verifyModelCache(
  repoRoot: string,
  config: string | undefined,
  cacheDirOverride?: string,
): Promise<ModelCacheVerification> {
  const lock = JSON.parse(
    await readFile(join(repoRoot, 'grounding', 'models.lock.json'), 'utf8'),
  ) as ModelsLock;
  const cacheDir = cacheDirOverride ?? process.env.AIFETCHLY_MODEL_CACHE ?? join(repoRoot, 'grounding', '.model-cache');
  // All approved models' files are verified together: the cache backs the
  // whole lock, not one configuration.
  const expected: { path: string; sha256: string | undefined }[] = [];
  for (const model of lock.models ?? []) {
    for (const file of model.weightsFiles ?? []) {
      expected.push({ path: file.path, sha256: file.sha256 });
    }
  }
  const present: string[] = [];
  const missing: string[] = [];
  const hashMismatches: string[] = [];
  for (const file of expected) {
    const absolute = join(cacheDir, file.path);
    if (!file.path.includes('/')) {
      // Top-level names stay flat in the cache root.
    }
    const digest = await sha256File(absolute).catch(() => undefined);
    if (digest === undefined) {
      missing.push(file.path);
    } else if (file.sha256 !== undefined && digest !== file.sha256) {
      hashMismatches.push(file.path);
    } else {
      present.push(file.path);
    }
  }
  return { config: config ?? '(all)', cacheDir, expectedFiles: expected, present, missing, hashMismatches };
}

export async function modelPrepare(
  repoRoot: string,
  config: string | undefined,
  cacheDirOverride?: string,
): Promise<CommandResult> {
  const lock = JSON.parse(
    await readFile(join(repoRoot, 'grounding', 'models.lock.json'), 'utf8'),
  ) as ModelsLock;
  const status = lock.status;
  if (status !== 'approved') {
    return {
      outcome: 'missingPrerequisites',
      message: `grounding/models.lock.json status is '${status ?? 'malformed'}': the P0-D spike must pin revisions and weight hashes before anything is fetched. Downloads are always an explicit step, never an implicit fallback (design §6.6).`,
    };
  }
  // M04: with an approved lock, prepare verifies the configured cache and
  // reports exactly what is present/missing — it still never downloads.
  const verification = await verifyModelCache(repoRoot, config, cacheDirOverride);
  const lines = [
    `model:prepare --config ${config ?? '<id>'}: lock approved; cache verified, nothing downloaded`,
    `cache: ${verification.cacheDir}`,
    `present: ${verification.present.length}/${verification.expectedFiles.length}`,
  ];
  if (verification.missing.length > 0) {
    lines.push(`missing (${verification.missing.length}): ${verification.missing.slice(0, 8).join(', ')}${verification.missing.length > 8 ? ' …' : ''}`);
  }
  if (verification.hashMismatches.length > 0) {
    lines.push(`HASH MISMATCH (${verification.hashMismatches.length}): ${verification.hashMismatches.slice(0, 4).join(', ')}`);
  }
  if (verification.expectedFiles.length === 0) {
    lines.push('lock records no weight files — the P0-D pin must enumerate them before prepare can verify anything');
    return { outcome: 'missingPrerequisites', message: lines.join('\n'), result: verification };
  }
  if (verification.missing.length > 0 || verification.hashMismatches.length > 0) {
    return {
      outcome: 'missingPrerequisites',
      message: [...lines, "fetch is the maintainer's explicit action from the pinned URLs; model:prepare never downloads"].join("\n"),
      result: verification,
    };
  }
  return { outcome: 'ok', message: lines.join('\n'), result: verification };
}

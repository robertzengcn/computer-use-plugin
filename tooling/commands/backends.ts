/**
 * Platform-environment commands (design §2.2): backend:prepare / backend:test
 * / model:prepare. Each fails closed while its lock is unpinned; when pinned
 * on the matching platform it drives uv through the bounded subprocess
 * runner — never a floating dependency resolution.
 */
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';
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
    readonly commercialUse?: string;
    readonly status?: string;
    readonly weightsFiles?: readonly { readonly path: string; readonly sha256?: string; readonly bytes?: number }[] | null;
  }[];
}

export interface ModelCacheVerification {
  readonly config: string;
  readonly cacheDir: string;
  readonly expectedFiles: readonly { path: string; sha256: string; bytes: number }[];
  readonly present: readonly string[];
  readonly missing: readonly string[];
  readonly hashMismatches: readonly string[];
}

/** N09: revisions must be immutable pinned SHAs, never floating refs. */
function isImmutableRevision(revision: string): boolean {
  if (/^[0-9a-f]{40}$/i.test(revision)) {
    return true;
  }
  // Allow explicit pinned release tags like v1.2.3 (immutable); reject
  // branch names (main, latest, HEAD) and anything else.
  return /^v\d+\.\d+\.\d+(-[A-Za-z0-9.-]+)?$/.test(revision);
}

/** N09: explicitly approved spike/production states. `not-qualified` and
 * unknown states are never sufficient, but approved spike candidates do
 * not require prior production qualification. */
const APPROVED_MODEL_STATUSES = new Set(['approved', 'approved-for-spike']);

/** B13: resolve the selected configuration to exactly one locked model.
 * Returns the model or an error message. Unknown configs, missing
 * revisions/digests, blocked models, duplicates and escaping paths all
 * fail — config is never a reporting label. N09 additionally requires
 * immutable revisions, explicit approval/licence state and unambiguous
 * model identity. */
async function resolveLockedModel(
  repoRoot: string,
  lock: ModelsLock,
  config: string | undefined,
): Promise<{ model: NonNullable<ModelsLock['models']>[number] } | { error: string }> {
  if (config === undefined || config.trim().length === 0) {
    return { error: 'model:prepare requires --config <id> (the selected model configuration)' };
  }
  const models = lock.models ?? [];
  // Direct match on modelId first (modelIds legitimately contain '/').
  let selected = models.find((m) => m.modelId === config);
  // Otherwise resolve via grounding/configs/<config>.json → modelId.
  // Constrain config to a safe filename charset before joining it into a
  // filesystem path — values like ../../elsewhere/x must not probe outside
  // the configs dir (even though .json is appended and the result must still
  // parse to a locked modelId).
  if (selected === undefined && /^[A-Za-z0-9._-]+$/.test(config)) {
    try {
      const cfgRaw = await readFile(join(repoRoot, 'grounding', 'configs', `${config}.json`), 'utf8');
      const cfg = JSON.parse(cfgRaw) as { modelId?: unknown };
      if (typeof cfg.modelId === 'string') {
        selected = models.find((m) => m.modelId === cfg.modelId);
      }
    } catch {
      /* no config file — fall through to unknown-config error */
    }
  }
  if (selected === undefined) {
    return { error: `unknown model configuration '${config}': no locked model matches this id` };
  }
  // N09: duplicate model identities are ambiguous — refuse to guess.
  const matches = models.filter((m) => m.modelId === selected.modelId);
  if (matches.length > 1) {
    return { error: `model configuration '${config}' matches ${matches.length} locked models — ambiguous identity refused` };
  }
  // Blocked/future models never prepare (CU-INST-11).
  if (selected.commercialUse === 'blocked' || (selected.status ?? '').startsWith('blocked')) {
    return { error: `model configuration '${config}' is blocked pending commercial licence clearance — preparation refused` };
  }
  // N09: explicit approval and licence eligibility. `not-qualified` and
  // unknown states fail; approved spike candidates pass without prior
  // production qualification.
  if (!APPROVED_MODEL_STATUSES.has(selected.status ?? '')) {
    return { error: `model configuration '${config}' status '${selected.status ?? 'missing'}' is not an approved preparation state (need approved or approved-for-spike)` };
  }
  if (selected.commercialUse !== 'allowed') {
    return { error: `model configuration '${config}' commercialUse '${selected.commercialUse ?? 'missing'}' is not an approved licence state (need allowed)` };
  }
  if (typeof selected.revision !== 'string' || selected.revision.length === 0) {
    return { error: `model configuration '${config}' has no pinned revision — the P0-D spike must pin it first` };
  }
  // N09: floating revisions (main/latest/HEAD) never establish an immutable
  // approved source identity.
  if (!isImmutableRevision(selected.revision)) {
    return { error: `model configuration '${config}' revision '${selected.revision}' is not immutable — pin a full commit SHA or release tag` };
  }
  const files = selected.weightsFiles;
  if (!Array.isArray(files) || files.length === 0) {
    return { error: `model configuration '${config}' records no weight files — the P0-D pin must enumerate them` };
  }
  const seen = new Set<string>();
  for (const file of files) {
    if (typeof file.path !== 'string' || file.path.length === 0) {
      return { error: `model configuration '${config}' has a weight file with an empty path` };
    }
    // Review: segment-based traversal check (a bare substring test would
    // reject innocent names like `my..model.bin`). isAbsolute covers the
    // host platform; the drive-letter pattern covers Windows-absolute
    // spellings on any platform; realpath containment below is the backstop.
    if (isAbsolute(file.path) || /^[A-Za-z]:[\\/]/.test(file.path) || file.path.split('/').includes('..') || file.path.split('\\').includes('..')) {
      return { error: `model configuration '${config}' weight path escapes the cache: ${file.path}` };
    }
    if (seen.has(file.path)) {
      return { error: `model configuration '${config}' lists duplicate weight path ${file.path}` };
    }
    seen.add(file.path);
    if (typeof file.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(file.sha256)) {
      return { error: `model configuration '${config}' file ${file.path} lacks a pinned 64-hex SHA-256` };
    }
    if (typeof file.bytes !== 'number' || !Number.isInteger(file.bytes) || file.bytes < 0) {
      return { error: `model configuration '${config}' file ${file.path} lacks a declared byte size` };
    }
  }
  return { model: selected };
}

/** M04/B13: verify ONLY the selected configuration's cache against the
 * approved lock. Never downloads — fetching weights is the maintainer's
 * explicit action (§6.6). Hashes and sizes are both required. */
export async function verifyModelCache(
  repoRoot: string,
  config: string | undefined,
  cacheDirOverride?: string,
): Promise<ModelCacheVerification> {
  const lock = JSON.parse(
    await readFile(join(repoRoot, 'grounding', 'models.lock.json'), 'utf8'),
  ) as ModelsLock;
  const cacheDir = cacheDirOverride ?? process.env.AIFETCHLY_MODEL_CACHE ?? join(repoRoot, 'grounding', '.model-cache');
  const resolved = await resolveLockedModel(repoRoot, lock, config);
  // Unresolvable configs verify nothing — callers surface the error.
  // Preserve shape: empty expectations signal the misconfiguration.
  if ('error' in resolved) {
    return { config: config ?? '(all)', cacheDir, expectedFiles: [], present: [], missing: [], hashMismatches: [] };
  }
  const expected: { path: string; sha256: string; bytes: number }[] = [];
  for (const file of resolved.model.weightsFiles ?? []) {
    // Validation guarantees sha256/bytes present; narrow for TS.
    if (typeof file.sha256 === 'string' && typeof file.bytes === 'number') {
      expected.push({ path: file.path, sha256: file.sha256, bytes: file.bytes });
    }
  }
  const present: string[] = [];
  const missing: string[] = [];
  const hashMismatches: string[] = [];
  const { stat, lstat, realpath } = await import('node:fs/promises');
  // N09: resolve the cache root once so symlinked cache entries escaping
  // it are rejected even though stat()/hashing follow links.
  const realCache = await realpath(cacheDir).catch(() => cacheDir);
  for (const file of expected) {
    const absolute = join(cacheDir, file.path);
    // N09: outside symlinks never satisfy the cache, even with matching
    // bytes — preparation success must imply a contained cache.
    const realTarget = await realpath(absolute).catch(() => undefined);
    if (realTarget !== undefined) {
      const rel = relative(realCache, realTarget);
      if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
        hashMismatches.push(file.path);
        continue;
      }
    }
    const linkInfo = await lstat(absolute).catch(() => undefined);
    if (linkInfo !== undefined && linkInfo.isSymbolicLink() && realTarget === undefined) {
      missing.push(file.path);
      continue;
    }
    const info = await stat(absolute).catch(() => undefined);
    if (info === undefined) {
      missing.push(file.path);
      continue;
    }
    const digest = await sha256File(absolute).catch(() => undefined);
    if (digest === undefined) {
      missing.push(file.path);
    } else if (digest !== file.sha256 || info.size !== file.bytes) {
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
  // B13: resolve and validate the selected configuration first — unknown
  // configs, missing revisions/digests, blocked models, duplicates and
  // escaping paths fail here, never as a false success.
  const resolved = await resolveLockedModel(repoRoot, lock, config);
  if ('error' in resolved) {
    return { outcome: 'missingPrerequisites', message: resolved.error };
  }
  // M04: with an approved lock, prepare verifies the selected config's
  // cache and reports exactly what is present/missing — it still never downloads.
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

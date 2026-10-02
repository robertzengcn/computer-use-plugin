/**
 * Platform-environment commands (design §2.2): backend:prepare / backend:test
 * / model:prepare. Each fails closed while its lock is unpinned; when pinned
 * on the matching platform it drives uv through the bounded subprocess
 * runner — never a floating dependency resolution.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildArgv, runProcess } from '../processes/run.js';
import type { CommandResult } from '../cli.js';

interface UpstreamLock {
  readonly status?: string;
  readonly selectedRevision?: string | null;
  readonly pythonVersion?: string | null;
}

async function readLock(repoRoot: string, relative: string): Promise<UpstreamLock> {
  return JSON.parse(await readFile(join(repoRoot, relative), 'utf8')) as UpstreamLock;
}

const TARGET_LOCK: Record<string, string> = {
  'win32-x64': join('adapters', 'windows', 'upstream.lock'),
  'darwin-arm64': join('adapters', 'macos', 'ghost-os', 'upstream.lock'),
};
const TARGET_DIR: Record<string, string> = {
  'win32-x64': join('adapters', 'windows'),
  'darwin-arm64': join('adapters', 'macos'),
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
  if (lock.status !== 'pinned' || !lock.selectedRevision) {
    return {
      outcome: 'missingPrerequisites',
      message: `${dir}/upstream.lock is '${lock.status ?? 'malformed'}': the P0-C/P0-E spike must pin the exact revision before the environment can be synchronized`,
    };
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
    if (dir !== 'adapters/windows') {
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

export async function modelPrepare(repoRoot: string, config: string | undefined): Promise<CommandResult> {
  const lock = await readLock(repoRoot, 'grounding/models.lock.json');
  const status = (lock as { status?: string }).status;
  if (status !== 'approved') {
    return {
      outcome: 'missingPrerequisites',
      message: `grounding/models.lock.json status is '${status ?? 'malformed'}': the P0-D spike must pin revisions and weight hashes before anything is fetched. Downloads are always an explicit step, never an implicit fallback (design §6.6).`,
    };
  }
  return {
    outcome: 'missingPrerequisites',
    message: `model:prepare --config ${config ?? '<id>'}: fetch orchestration activates with the pinned revisions (status approved); the cache directory must be configured first.`,
  };
}

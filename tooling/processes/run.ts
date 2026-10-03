/**
 * Bounded child-process execution for developer tasks (design §1.3):
 * argv arrays with shell:false, explicit cwd, byte-capped output capture,
 * deadlines with SIGTERM→SIGKILL escalation, and AbortSignal cancellation.
 * JSON control records use stdout; logs go to stderr.
 */
import { spawn, type ChildProcess } from 'node:child_process';

export interface RunProcessOptions {
  readonly argv: readonly string[];
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
  readonly killGraceMs?: number;
  readonly signal?: AbortSignal;
  readonly maxOutputBytes?: number;
}

export interface ProcessResult {
  readonly exitCode: number | null;
  readonly outcome: 'ok' | 'failed' | 'cancelled';
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
  readonly cancelled: boolean;
  readonly truncated: boolean;
  readonly durationMs: number;
}

const DEFAULT_MAX_OUTPUT_BYTES = 10 * 1024 * 1024;
const DEFAULT_KILL_GRACE_MS = 2_000;

/** Developer subprocess argv builders. Everything runs with shell:false. */
export type ArgvSpec =
  | { readonly kind: 'raw'; readonly argv: readonly string[] }
  | {
      readonly kind: 'uv-python';
      readonly project: string;
      readonly module: string;
      readonly extraArgs?: readonly string[];
    };

const MODULE_PATTERN = /^[a-z_][a-z0-9_.]*$/i;
// Repository-relative project directories (e.g. `grounding`, `adapters/windows`):
// segments of [a-z0-9_-] joined by forward slashes. Absolute paths, `..` and
// backslashes stay rejected so the subprocess cwd can never escape the repo (B13).
const PROJECT_PATTERN = /^(?:[a-z0-9_-]+)(?:\/[a-z0-9_-]+)*$/i;

export function buildArgv(spec: ArgvSpec): string[] {
  switch (spec.kind) {
    case 'raw':
      return [...spec.argv];
    case 'uv-python': {
      if (!MODULE_PATTERN.test(spec.module)) {
        throw new Error(`invalid module '${spec.module}'`);
      }
      if (!PROJECT_PATTERN.test(spec.project)) {
        throw new Error(`invalid project '${spec.project}'`);
      }
      return [
        'uv',
        'run',
        '--locked',
        '--project',
        spec.project,
        'python',
        '-m',
        spec.module,
        ...(spec.extraArgs ?? []),
      ];
    }
  }
}

export function runProcess(options: RunProcessOptions): Promise<ProcessResult> {
  const { argv, cwd, env, timeoutMs, signal } = options;
  const executable = argv[0];
  if (executable === undefined || executable.length === 0) {
    throw new Error('argv must name an executable');
  }
  const maxBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  const killGraceMs = options.killGraceMs ?? DEFAULT_KILL_GRACE_MS;
  const startedAt = Date.now();

  // B19: an already-aborted signal must launch nothing.
  if (signal?.aborted) {
    return Promise.resolve({
      exitCode: null,
      outcome: 'cancelled' as const,
      stdout: '',
      stderr: '',
      timedOut: false,
      cancelled: true,
      truncated: false,
      durationMs: 0,
    });
  }

  return new Promise<ProcessResult>((resolve, reject) => {
    let child: ChildProcess;
    try {
      child = spawn(executable, argv.slice(1), {
        shell: false,
        cwd,
        env: env ?? process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
        // Own process group so group signals reach descendants (B19).
        detached: process.platform !== 'win32',
      });
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
      return;
    }

    let stdout: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    let stderr: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    let truncated = false;
    let timedOut = false;
    let cancelled = false;
    let settled = false;

    const appendCapped = (chunk: Buffer, current: Buffer): Buffer => {
      if (current.byteLength >= maxBytes) {
        truncated = true;
        return current;
      }
      if (current.byteLength + chunk.byteLength > maxBytes) {
        truncated = true;
        // Byte-accurate cap (B19): slice the BUFFER, not the string — string
        // slicing counts UTF-16 code units and can split multibyte chars.
        return Buffer.concat([current, chunk]).subarray(0, maxBytes);
      }
      return Buffer.concat([current, chunk]);
    };

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout = appendCapped(chunk, stdout);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr = appendCapped(chunk, stderr);
    });

    const killTree = (): void => {
      if (child.exitCode !== null || child.signalCode !== null) {
        return;
      }
      // B19: best-effort descendant cleanup. The child owns its own process
      // group on POSIX (detached), so the negative PID signal reaches
      // descendants; Windows taskkill walks the tree explicitly.
      if (process.platform === 'win32') {
        child.kill(); // graceful console event first
        const escalate = setTimeout(() => {
          if (child.pid !== undefined) {
            spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { shell: false, stdio: 'ignore' });
          }
          child.kill('SIGKILL');
        }, killGraceMs);
        escalate.unref();
        return;
      }
      if (child.pid !== undefined) {
        try {
          process.kill(-child.pid, 'SIGTERM');
        } catch {
          child.kill('SIGTERM');
        }
      } else {
        child.kill('SIGTERM');
      }
      const escalate = setTimeout(() => {
        if (child.pid !== undefined) {
          try {
            process.kill(-child.pid, 'SIGKILL');
          } catch {
            /* already gone */
          }
        }
        child.kill('SIGKILL');
      }, killGraceMs);
      escalate.unref();
    };

    const timeout = timeoutMs === undefined ? undefined : setTimeout(() => {
      timedOut = true;
      killTree();
    }, timeoutMs);
    timeout?.unref();

    const onAbort = (): void => {
      cancelled = true;
      killTree();
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    const finish = (exitCode: number | null): void => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
      signal?.removeEventListener('abort', onAbort);
      const outcome = timedOut || cancelled ? 'cancelled' : exitCode === 0 ? 'ok' : 'failed';
      resolve({
        exitCode,
        outcome,
        stdout: stdout.toString('utf8'),
        stderr: stderr.toString('utf8'),
        timedOut,
        cancelled,
        truncated,
        durationMs: Date.now() - startedAt,
      });
    };

    child.on('error', (error: NodeJS.ErrnoException) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
      signal?.removeEventListener('abort', onAbort);
      reject(new Error(`spawn ${executable} failed: ${error.message}`));
    });
    child.on('close', (code: number | null) => finish(code));
  });
}

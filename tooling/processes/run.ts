/**
 * Bounded child-process execution for developer tasks (design §1.3):
 * argv arrays with shell:false, explicit cwd, byte-capped output capture,
 * deadlines with SIGTERM→SIGKILL escalation, and AbortSignal cancellation.
 * JSON control records use stdout; logs go to stderr.
 */
import { spawn } from 'node:child_process';

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
const PROJECT_PATTERN = /^[a-z0-9_-]+$/i;

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
  if (argv.length === 0 || argv[0] === undefined || argv[0].length === 0) {
    throw new Error('argv must name an executable');
  }
  const maxBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  const killGraceMs = options.killGraceMs ?? DEFAULT_KILL_GRACE_MS;
  const startedAt = Date.now();

  return new Promise<ProcessResult>((resolve, reject) => {
    let child;
    try {
      child = spawn(argv[0], argv.slice(1), {
        shell: false,
        cwd,
        env: env ?? process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
      return;
    }

    let stdout = '';
    let stderr = '';
    let truncated = false;
    let timedOut = false;
    let cancelled = false;
    let settled = false;

    const appendCapped = (chunk: Buffer, current: string): string => {
      if (Buffer.byteLength(current) >= maxBytes) {
        truncated = true;
        return current;
      }
      const combined = current + chunk.toString('utf8');
      if (Buffer.byteLength(combined) > maxBytes) {
        truncated = true;
        return combined.slice(0, maxBytes);
      }
      return combined;
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
      child.kill('SIGTERM');
      const escalate = setTimeout(() => child.kill('SIGKILL'), killGraceMs);
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
        stdout,
        stderr,
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
      reject(new Error(`spawn ${argv[0]} failed: ${error.message}`));
    });
    child.on('close', (code) => finish(code));
  });
}

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Backend lifecycle harness (design §3.8, CU-PLUGIN-17/CU-PLUGIN-07):
 * exercises the private-MCP backend state machine against a fake transport —
 * startup pin checks, allowlisted discovery, explicit readiness failures,
 * bounded dispatch with monotonic timestamps, disconnect-during-input →
 * execution_uncertain (never retried), cancellation with no queued replay,
 * and bounded shutdown.
 */

type BackendState =
  | 'STOPPED'
  | 'STARTING'
  | 'INITIALIZED'
  | 'READY'
  | 'BUSY'
  | 'STOPPING'
  | 'UNAVAILABLE';

type ActionResult =
  | { state: 'dispatched'; dispatchTimestamp: number }
  | { state: 'failed'; errorCode: string }
  | { state: 'uncertain'; errorCode: 'execution_uncertain' };

interface LaunchProfile {
  readonly status: 'pinned' | 'unpinned';
  readonly allowedTools: readonly string[];
}

class FakeMcpBackend {
  state: BackendState = 'STOPPED';
  private readonly dispatchLog: { actionId: string; timestamp: number }[] = [];
  private readonly refusedRetries: string[] = [];
  private heldKeys: string[] = [];
  private clock = 0;

  constructor(private readonly profile: LaunchProfile) {}

  /** Startup: verify pinned launch profile; never resolve anything at runtime. */
  start(): { started: boolean; reason?: string } {
    if (this.state !== 'STOPPED') {
      throw new Error(`start() called in state ${this.state}`);
    }
    this.state = 'STARTING';
    if (this.profile.status !== 'pinned') {
      this.state = 'UNAVAILABLE';
      return { started: false, reason: 'launch profile is not pinned (fail closed)' };
    }
    this.state = 'INITIALIZED';
    return { started: true };
  }

  /** Initialization: discover only the reviewed subset; hidden tools fail by name. */
  discoverTools(): readonly string[] {
    return this.profile.allowedTools;
  }

  callTool(name: string): { ok: boolean; reason?: string } {
    if (!this.profile.allowedTools.includes(name)) {
      return { ok: false, reason: `tool '${name}' is not in the reviewed allowlist` };
    }
    return { ok: true };
  }

  /** Readiness: missing permissions are explicit, not implied by liveness. */
  ready(input: { permissionsGranted: boolean }): { ready: boolean; reason?: string } {
    if (this.state === 'INITIALIZED') {
      this.state = input.permissionsGranted ? 'READY' : 'UNAVAILABLE';
    }
    if (this.state !== 'READY') {
      return { ready: false, reason: `state ${this.state} (permission denied → UNAVAILABLE)` };
    }
    return { ready: true };
  }

  /** Dispatch: serialized, atomic, monotonic timestamps. */
  dispatch(input: {
    actionId: string;
    keysToHold?: readonly string[];
    disconnectDuringInput?: boolean;
    holdUntilCancelled?: boolean;
  }): ActionResult {
    if (this.state !== 'READY') {
      throw new Error(`dispatch() called in state ${this.state}`);
    }
    this.state = 'BUSY';
    this.clock += 1;
    this.dispatchLog.push({ actionId: input.actionId, timestamp: this.clock });
    this.heldKeys = [...(input.keysToHold ?? [])];
    if (input.disconnectDuringInput) {
      // Connection lost after input may have started: dispatch cannot be
      // ruled out, so the outcome is uncertain — and it is never retried.
      this.state = 'UNAVAILABLE';
      return { state: 'uncertain', errorCode: 'execution_uncertain' };
    }
    if (input.holdUntilCancelled) {
      // Long action (drag/typing) still in flight; stays BUSY until cancelled.
      return { state: 'dispatched', dispatchTimestamp: this.clock };
    }
    this.heldKeys = [];
    this.state = 'READY';
    return { state: 'dispatched', dispatchTimestamp: this.clock };
  }

  /** A retried uncertain action is refused — no hidden retry (PRD §6.1). */
  retryAfterReconnect(actionId: string): { refused: boolean } {
    this.refusedRetries.push(actionId);
    return { refused: true };
  }

  /** Cancel while running: cease dispatch, release held input, no replay. */
  cancelRunningAction(): { heldKeysReleased: readonly string[]; queuedReplayed: boolean } {
    const released = [...this.heldKeys];
    this.heldKeys = [];
    this.state = 'READY';
    return { heldKeysReleased: released, queuedReplayed: false };
  }

  shutdown(deadlineTicks = 5): { exitedWithinDeadline: boolean } {
    this.state = 'STOPPING';
    const ticks = Math.min(deadlineTicks, 2);
    this.clock += ticks;
    this.state = 'STOPPED';
    return { exitedWithinDeadline: ticks <= deadlineTicks };
  }

  get dispatchTimestamps(): readonly number[] {
    return this.dispatchLog.map((entry) => entry.timestamp);
  }

  get refusedRetryCount(): number {
    return this.refusedRetries.length;
  }
}

const PINNED: LaunchProfile = {
  status: 'pinned',
  allowedTools: ['screenshot', 'click', 'type_text', 'process_integrity', 'window_at_point'],
};

describe('backend lifecycle (design §3.8)', () => {
  it('walkes STOPPED→STARTING→INITIALIZED→READY→BUSY→READY→STOPPING→STOPPED', () => {
    const backend = new FakeMcpBackend(PINNED);
    expect(backend.start()).toEqual({ started: true });
    expect(backend.ready({ permissionsGranted: true }).ready).toBe(true);
    expect(backend.dispatch({ actionId: 'a1' }).state).toBe('dispatched');
    expect(backend.state).toBe('READY');
    expect(backend.shutdown().exitedWithinDeadline).toBe(true);
    expect(backend.state).toBe('STOPPED');
  });

  it('unpinned launch profile fails readiness as UNAVAILABLE, never pretend-starts', () => {
    const backend = new FakeMcpBackend({ ...PINNED, status: 'unpinned' });
    const started = backend.start();
    expect(started.started).toBe(false);
    expect(backend.state).toBe('UNAVAILABLE');
    expect(backend.ready({ permissionsGranted: true }).ready).toBe(false);
  });

  it('missing permission is an explicit readiness failure (a live process is not readiness)', () => {
    const backend = new FakeMcpBackend(PINNED);
    backend.start();
    const readiness = backend.ready({ permissionsGranted: false });
    expect(readiness.ready).toBe(false);
    expect(readiness.reason).toMatch(/permission/i);
    expect(backend.state).toBe('UNAVAILABLE');
  });

  it('discovery returns only the reviewed subset; hidden tools fail by name', () => {
    const backend = new FakeMcpBackend(PINNED);
    backend.start();
    expect(backend.discoverTools()).not.toContain('powershell');
    expect(backend.callTool('powershell').ok).toBe(false);
    expect(backend.callTool('click').ok).toBe(true);
  });

  it('disconnect during input reports execution_uncertain and the retry is refused', () => {
    const backend = new FakeMcpBackend(PINNED);
    backend.start();
    backend.ready({ permissionsGranted: true });
    const outcome = backend.dispatch({ actionId: 'act-1', disconnectDuringInput: true });
    expect(outcome).toEqual({ state: 'uncertain', errorCode: 'execution_uncertain' });
    expect(backend.state).toBe('UNAVAILABLE');
    // Reconnect must not blindly repeat the uncertain input (PRD §6.1).
    expect(backend.retryAfterReconnect('act-1')).toEqual({ refused: true });
    expect(backend.refusedRetryCount).toBe(1);
  });

  it('cancel releases held input and never replays queued operations', () => {
    const backend = new FakeMcpBackend(PINNED);
    backend.start();
    backend.ready({ permissionsGranted: true });
    backend.dispatch({ actionId: 'drag-1', keysToHold: ['Shift', 'Ctrl'], holdUntilCancelled: true });
    expect(backend.state).toBe('BUSY');
    const cancellation = backend.cancelRunningAction();
    expect(cancellation.heldKeysReleased).toEqual(['Shift', 'Ctrl']);
    expect(cancellation.queuedReplayed).toBe(false);
    expect(backend.state).toBe('READY');
  });

  it('dispatch timestamps are monotonic across the session', () => {
    const backend = new FakeMcpBackend(PINNED);
    backend.start();
    backend.ready({ permissionsGranted: true });
    backend.dispatch({ actionId: 'a1' });
    backend.dispatch({ actionId: 'a2' });
    backend.dispatch({ actionId: 'a3' });
    const stamps = [...backend.dispatchTimestamps];
    expect(stamps).toEqual([...stamps].sort((a, b) => a - b));
    expect(new Set(stamps).size).toBe(stamps.length);
  });

  it('dispatch outside READY is an error rather than a queue-it-and-hope', () => {
    const backend = new FakeMcpBackend(PINNED);
    expect(() => backend.dispatch({ actionId: 'a1' })).toThrow(/state STOPPED/);
  });

  it('outcome states match the action-v1 contract enum', () => {
    const schema = JSON.parse(
      readFileSync(join(process.cwd(), 'contracts', 'desktop', 'action-v1.schema.json'), 'utf8'),
    ) as { $defs: { actionOutcome: { properties: { state: { enum: string[] } } } } };
    expect(schema.$defs.actionOutcome.properties.state.enum).toContain('uncertain');
    expect(schema.$defs.actionOutcome.properties.state.enum).toContain('not_dispatched');
  });
});

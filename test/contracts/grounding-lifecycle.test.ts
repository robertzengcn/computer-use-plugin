import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Grounding lifecycle harness (design §3.4.1, CU-PLUGIN-03): exercises
 * capabilities → load → ground → cancel → unload against a fake adapter to
 * pin the contract guarantees the host worker must implement — typed
 * failures, incompatible-load rejection, cancel suppression and identity
 * echo — using the same fixture data the host consumer suite consumes.
 */

const CONTRACTS = join(process.cwd(), 'contracts');

interface LifecycleConfiguration {
  readonly modelConfigurationId: string;
  readonly adapterId: string;
  readonly adapterVersion: string;
  readonly preprocessingRevision: string;
  readonly decodingRevision: string;
  readonly calibrationRevision: string;
}

type LifecycleState = 'unloaded' | 'loading' | 'loaded' | 'busy' | 'unloading';

type GroundFailureCode =
  | 'target_not_found'
  | 'target_ambiguous'
  | 'invalid_grounding_output'
  | 'action_cancelled'
  | 'resource_limit'
  | 'model_not_ready'
  | 'protocol_mismatch';

/** Fake in-memory adapter implementing the §3.4.1 lifecycle table. */
class FakeGroundingAdapter {
  private state: LifecycleState = 'unloaded';
  private loadedIdentity: LifecycleConfiguration | undefined;
  private nextRequest = 0;
  private readonly cancelled = new Set<string>();

  constructor(private readonly identity: LifecycleConfiguration) {}

  get currentState(): LifecycleState {
    return this.state;
  }

  /** load: rejects incompatible packages before inference. */
  load(packageIdentity: LifecycleConfiguration): { loaded: true } | { loaded: false; errorCode: 'protocol_mismatch' } {
    if (this.state !== 'unloaded') {
      throw new Error('adapter already loaded');
    }
    this.state = 'loading';
    const compatible = (Object.keys(this.identity) as (keyof LifecycleConfiguration)[]).every(
      (field) => this.identity[field] === packageIdentity[field],
    );
    if (!compatible) {
      this.state = 'unloaded';
      return { loaded: false, errorCode: 'protocol_mismatch' };
    }
    this.loadedIdentity = packageIdentity;
    this.state = 'loaded';
    return { loaded: true };
  }

  /** ground: typed failure or candidates; echoes the loaded identity. */
  ground(input: {
    requestId?: string;
    sessionGeneration: number;
    observationId: string;
    failWith?: GroundFailureCode;
    delayMs?: number;
  }): {
    requestId: string;
    identity: LifecycleConfiguration;
    candidates: { x: number; y: number }[] | null;
    failure?: GroundFailureCode;
  } {
    if (this.state !== 'loaded' && this.state !== 'busy') {
      throw new Error(`ground() called in state ${this.state}`);
    }
    const requestId = input.requestId ?? `req-${++this.nextRequest}`;
    if (this.cancelled.has(requestId)) {
      // cancel suppresses the result even if inference already completed.
      return { requestId, identity: this.loadedIdentity!, candidates: null, failure: 'action_cancelled' };
    }
    if (input.failWith !== undefined) {
      return { requestId, identity: this.loadedIdentity!, candidates: null, failure: input.failWith };
    }
    this.state = 'busy';
    return { requestId, identity: this.loadedIdentity!, candidates: [{ x: 0.5, y: 0.5 }] };
  }

  /** cancel: marks work cancelled and suppresses its result. */
  cancel(requestId: string): void {
    this.cancelled.add(requestId);
  }

  /** unload: releases sessions; version leases end after unload is confirmed. */
  unload(): void {
    this.state = 'unloading';
    this.loadedIdentity = undefined;
    this.state = 'unloaded';
  }
}

const PROFILE: LifecycleConfiguration = {
  modelConfigurationId: 'gui-actor-2b-fp16@0.1.0',
  adapterId: 'gui-actor-onnx',
  adapterVersion: '0.1.0',
  preprocessingRevision: 'prep-v1',
  decodingRevision: 'dec-v1',
  calibrationRevision: 'cal-v1',
};

describe('grounding lifecycle (design §3.4.1)', () => {
  it('capabilities fixture carries the contract identity this harness assumes', () => {
    const capabilities = JSON.parse(
      readFileSync(join(CONTRACTS, 'fixtures', 'grounding', 'valid', 'capabilities.json'), 'utf8'),
    ) as { adapterId: string; contractVersion: number };
    expect(capabilities.adapterId).toBe(PROFILE.adapterId);
    expect(capabilities.contractVersion).toBe(1);
  });

  it('load accepts the exact package identity and rejects a mismatched one', () => {
    const adapter = new FakeGroundingAdapter(PROFILE);
    expect(adapter.load(PROFILE)).toEqual({ loaded: true });
    expect(adapter.currentState).toBe('loaded');

    const mismatched = new FakeGroundingAdapter(PROFILE);
    const wrong = { ...PROFILE, calibrationRevision: 'cal-v2' };
    expect(mismatched.load(wrong)).toEqual({ loaded: false, errorCode: 'protocol_mismatch' });
    expect(mismatched.currentState).toBe('unloaded');
  });

  it('ground echoes the loaded identity on every result', () => {
    const adapter = new FakeGroundingAdapter(PROFILE);
    adapter.load(PROFILE);
    const result = adapter.ground({ sessionGeneration: 3, observationId: 'obs-1' });
    expect(result.identity).toEqual(PROFILE);
    expect(result.candidates).toEqual([{ x: 0.5, y: 0.5 }]);
  });

  it('typed failures use only the contract failure codes', () => {
    const adapter = new FakeGroundingAdapter(PROFILE);
    adapter.load(PROFILE);
    const result = adapter.ground({ sessionGeneration: 0, observationId: 'o', failWith: 'target_ambiguous' });
    expect(result.candidates).toBeNull();
    expect(result.failure).toBe('target_ambiguous');
  });

  it('cancel suppresses the result of the named request (§3.4.1 cancel row)', () => {
    const adapter = new FakeGroundingAdapter(PROFILE);
    adapter.load(PROFILE);
    adapter.cancel('req-42');
    const suppressed = adapter.ground({
      requestId: 'req-42',
      sessionGeneration: 0,
      observationId: 'o',
    });
    expect(suppressed.failure).toBe('action_cancelled');
    expect(suppressed.candidates).toBeNull();
  });

  it('ground outside loaded state is an error, never a silent pass', () => {
    const adapter = new FakeGroundingAdapter(PROFILE);
    expect(() => adapter.ground({ sessionGeneration: 0, observationId: 'o' })).toThrow(/state unloaded/);
  });

  it('unload releases the identity; the adapter cannot ground afterwards', () => {
    const adapter = new FakeGroundingAdapter(PROFILE);
    adapter.load(PROFILE);
    adapter.unload();
    expect(adapter.currentState).toBe('unloaded');
    expect(() => adapter.ground({ sessionGeneration: 0, observationId: 'o' })).toThrow(/state unloaded/);
  });
});

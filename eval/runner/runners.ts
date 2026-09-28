/**
 * Runner profiles for offline evaluation. Both are local, read-only and
 * process-free: replay never launches a desktop backend, sends input, or
 * contacts a model service (CU-PLUGIN-12, design §1.3).
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Point, Region } from '../metrics/hits.js';

export interface RunnerConfiguration {
  readonly modelConfigurationId: string;
  readonly adapterId: string;
  readonly adapterVersion: string;
  readonly preprocessingRevision: string;
  readonly decodingRevision: string;
  readonly calibrationRevision: string;
}

export interface RunnerProfile {
  readonly name: string;
  readonly kind: 'recorded' | 'synthetic';
  readonly configuration: RunnerConfiguration;
}

export interface GroundingCandidate {
  readonly point: Point;
  readonly score: number;
}

export interface GroundingCaseResult {
  readonly caseId: string;
  readonly candidates: readonly GroundingCandidate[];
  readonly inferenceMs: number;
}

export class IncompatibleConfigurationException extends Error {
  constructor(expected: string, actual: string) {
    super(
      `incompatible configuration: evidence was produced by '${actual}' but '${expected}' was requested; replay never substitutes a different model/processing revision (design §3.6)`,
    );
    this.name = 'IncompatibleConfigurationException';
  }
}

interface ProfilesFile {
  readonly version: number;
  readonly profiles: Record<string, RunnerProfile>;
}

export async function loadProfilesFromFile(profilesPath: string): Promise<Map<string, RunnerProfile>> {
  const parsed = JSON.parse(await readFile(profilesPath, 'utf8')) as ProfilesFile;
  return new Map(Object.entries(parsed.profiles).map(([name, profile]) => [name, { ...profile, name }]));
}

/** Recorded evidence from a trace bundle step. */
export interface RecordedStep {
  readonly caseId: string;
  readonly candidates: readonly GroundingCandidate[];
  readonly inferenceMs: number;
  readonly configuration: RunnerConfiguration;
}

/** Replay the recorded candidates of a bundle; identity must match the profile. */
export function recordedRunner(
  profile: RunnerProfile,
  steps: readonly RecordedStep[],
): (caseId: string) => GroundingCaseResult {
  const byCase = new Map(steps.map((step) => [step.caseId, step] as const));
  return (caseId: string): GroundingCaseResult => {
    const step = byCase.get(caseId);
    if (step === undefined) {
      throw new Error(`no recorded evidence for case '${caseId}'`);
    }
    if (step.configuration.modelConfigurationId !== profile.configuration.modelConfigurationId) {
      throw new IncompatibleConfigurationException(
        profile.configuration.modelConfigurationId,
        step.configuration.modelConfigurationId,
      );
    }
    return { caseId, candidates: step.candidates, inferenceMs: step.inferenceMs };
  };
}

/**
 * Deterministic stub: hash(caseId ‖ configId) seeds candidate placement.
 * ~3 of 4 region cases hit, a fixed fraction of absent cases false-accept,
 * purely so compare/replay tooling has reproducible numbers.
 */
export function syntheticRunner(profile: RunnerProfile): (input: SyntheticInput) => GroundingCaseResult {
  return (input: SyntheticInput): GroundingCaseResult => {
    const seed = createHash('sha256')
      .update(`${input.caseId}:${profile.configuration.modelConfigurationId}`)
      .digest();
    const first = seed[0] ?? 0;
    const second = seed[1] ?? 0;
    const third = seed[2] ?? 0;
    if (input.expected.kind === 'absent') {
      const candidates = second % 5 === 0 ? [{ point: { x: 1, y: 1 }, score: 0.5 }] : [];
      return { caseId: input.caseId, candidates, inferenceMs: 100 + (third % 400) };
    }
    if (input.expected.kind === 'ambiguous') {
      return { caseId: input.caseId, candidates: [], inferenceMs: 100 + (third % 400) };
    }
    const region = input.expected.region as Region;
    const hit = first % 4 !== 0;
    const point: Point = hit
      ? {
          x: region.x + region.w / 2,
          y: region.y + region.h / 2,
        }
      : { x: region.x + region.w + 50, y: region.y + region.h + 50 };
    return {
      caseId: input.caseId,
      candidates: [{ point, score: 0.9 }],
      inferenceMs: 150 + (second % 350),
    };
  };
}

export interface SyntheticInput {
  readonly caseId: string;
  readonly expected:
    | { readonly kind: 'region'; readonly region: Region }
    | { readonly kind: 'absent' }
    | { readonly kind: 'ambiguous' };
}

export interface TraceBundleManifest {
  readonly schemaVersion: number;
  readonly traceId: string;
  readonly configuration: {
    readonly modelConfigurationId: string;
    readonly adapterId: string;
    readonly adapterVersion: string;
    readonly preprocessingRevision: string;
    readonly decodingRevision: string;
    readonly calibrationRevision: string;
  };
  readonly steps: readonly {
    readonly stepId: string;
    readonly caseId?: string;
    readonly grounding?: string;
  }[];
}

export interface GroundingRecord {
  readonly caseId: string;
  readonly candidates: readonly GroundingCandidate[];
  readonly inferenceMs: number;
}

/** Load a trace bundle's manifest + per-step grounding records. */
export async function loadTraceBundle(bundleDir: string): Promise<{
  manifest: TraceBundleManifest;
  records: readonly GroundingRecord[];
}> {
  const manifest = JSON.parse(await readFile(join(bundleDir, 'manifest.json'), 'utf8')) as TraceBundleManifest;
  const records: GroundingRecord[] = [];
  for (const step of manifest.steps) {
    if (step.grounding === undefined) {
      continue;
    }
    const grounding = JSON.parse(await readFile(join(bundleDir, step.grounding), 'utf8')) as GroundingRecord;
    records.push(grounding);
  }
  return { manifest, records };
}

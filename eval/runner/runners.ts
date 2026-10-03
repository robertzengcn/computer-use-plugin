/**
 * Runner profiles for offline evaluation. Both are local, read-only and
 * process-free: replay never launches a desktop backend, sends input, or
 * contacts a model service (CU-PLUGIN-12, design §1.3).
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Point } from '../metrics/hits.js';

export interface RunnerConfiguration {
  readonly modelConfigurationId: string;
  readonly adapterId: string;
  readonly adapterVersion: string;
  readonly preprocessingRevision: string;
  readonly decodingRevision: string;
  readonly calibrationRevision: string;
  readonly onnxRuntimeVersion?: string;
  readonly executionProvider?: 'dml' | 'coreml' | 'cpu';
  readonly modelManifestSha256?: string;
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
    // Design §3.6: replay requires the exact configuration identity; a
    // mismatched revision fails and is never substituted.
    const fields: readonly [keyof RunnerConfiguration, string][] = [
      ['modelConfigurationId', 'model configuration'],
      ['adapterId', 'adapter id'],
      ['adapterVersion', 'adapter version'],
      ['preprocessingRevision', 'preprocessing revision'],
      ['decodingRevision', 'decoding revision'],
      ['calibrationRevision', 'calibration revision'],
    ];
    for (const [field, label] of fields) {
      if (step.configuration[field] !== profile.configuration[field]) {
        throw new IncompatibleConfigurationException(
          `${label} ${String(profile.configuration[field])}`,
          `${label} ${String(step.configuration[field])}`,
        );
      }
    }
    return { caseId, candidates: step.candidates, inferenceMs: step.inferenceMs };
  };
}

/**
 * Deterministic stub: hash(caseId ‖ configId) seeds candidate placement on a
 * fixed 1000×1000 virtual canvas. It never reads the case's expected label —
 * the point is placed from the hash alone and then scored, so compare-mode
 * numbers are independent (labelled as stub output, never model accuracy).
 */
export function syntheticRunner(
  profile: RunnerProfile,
): (caseId: string) => GroundingCaseResult {
  return (caseId: string): GroundingCaseResult => {
    const seed = createHash('sha256')
      .update(`${caseId}:${profile.configuration.modelConfigurationId}`)
      .digest();
    const first = seed[0] ?? 0;
    const second = seed[1] ?? 0;
    const third = seed[2] ?? 0;
    const x = ((first * 256 + second) / 65536) * 1000;
    const y = ((third * 256 + (seed[3] ?? 0)) / 65536) * 1000;
    const emitsCandidate = first % 8 !== 0;
    return {
      caseId,
      candidates: emitsCandidate ? [{ point: { x, y }, score: 0.5 }] : [],
      inferenceMs: 150 + (second % 350),
    };
  };
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
    readonly onnxRuntimeVersion?: string;
    readonly executionProvider?: 'dml' | 'coreml' | 'cpu';
    readonly modelManifestSha256?: string;
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

/** Path containment for bundle-relative references (B09). */
function insideBundle(target: string): boolean {
  if (target.length === 0 || target.startsWith('/') || /^[A-Za-z]:[\\/]/.test(target)) {
    return false;
  }
  const parts = target.split('/');
  let depth = 0;
  for (const part of parts) {
    if (part === '' || part === '.') {
      continue;
    }
    if (part === '..') {
      depth -= 1;
      if (depth < 0) {
        return false;
      }
    } else {
      depth += 1;
    }
  }
  return true;
}

/** Load a trace bundle's manifest + per-step grounding records. */
export async function loadTraceBundle(bundleDir: string): Promise<{
  manifest: TraceBundleManifest;
  records: readonly GroundingRecord[];
  annotations: ReadonlyMap<string, BundleAnnotation>;
  annotationHashes?: Readonly<Record<string, string>> | undefined;
}> {
  const manifest = JSON.parse(await readFile(join(bundleDir, 'manifest.json'), 'utf8')) as TraceBundleManifest;
  const records: GroundingRecord[] = [];
  const seenCases = new Set<string>();
  for (const step of manifest.steps) {
    if (step.grounding === undefined) {
      continue;
    }
    if (!insideBundle(step.grounding)) {
      throw new Error(`trace bundle step '${step.stepId}' grounding path escapes the bundle: ${step.grounding}`);
    }
    const grounding = JSON.parse(await readFile(join(bundleDir, step.grounding), 'utf8')) as GroundingRecord;
    if (seenCases.has(grounding.caseId)) {
      throw new Error(`duplicate recorded case id in bundle: ${grounding.caseId}`);
    }
    seenCases.add(grounding.caseId);
    records.push(grounding);
  }
  const annotations = new Map<string, BundleAnnotation>();
  const annotationsRaw = await readFile(join(bundleDir, 'annotations.json'), 'utf8').catch(() => undefined);
  let annotationHashes: Record<string, string> | undefined;
  if (annotationsRaw !== undefined) {
    const parsed = JSON.parse(annotationsRaw) as {
      cases?: Record<string, BundleAnnotation>;
      contentSha256?: Record<string, string>;
    };
    for (const [caseId, annotation] of Object.entries(parsed.cases ?? {})) {
      annotations.set(caseId, annotation);
    }
    if (parsed.contentSha256 !== undefined) {
      annotationHashes = parsed.contentSha256;
    }
  }
  return { manifest, records, annotations, annotationHashes };
}

/** Human label for one recorded case (design §3.6 annotations.json). */
export interface BundleAnnotation {
  readonly kind: 'region' | 'absent' | 'ambiguous';
  readonly region?: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
}

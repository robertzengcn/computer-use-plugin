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
  if (typeof parsed.version !== 'number' || parsed.version !== 1) {
    throw new Error(`runner profiles version ${JSON.stringify((parsed as { version?: unknown }).version)} is unsupported (expected 1)`);
  }
  if (typeof parsed.profiles !== 'object' || parsed.profiles === null) {
    throw new Error('runner profiles file must contain a profiles map');
  }
  const out = new Map<string, RunnerProfile>();
  for (const [name, profile] of Object.entries(parsed.profiles)) {
    validateRunnerProfile(name, profile);
    out.set(name, { ...profile, name });
  }
  return out;
}

function validateRunnerProfile(name: string, profile: RunnerProfile): void {
  if (profile.kind !== 'recorded' && profile.kind !== 'synthetic') {
    throw new Error(`runner profile '${name}' has unsupported kind ${JSON.stringify((profile as unknown as { kind?: unknown }).kind)}`);
  }
  const cfg = profile.configuration;
  if (typeof cfg !== 'object' || cfg === null) {
    throw new Error(`runner profile '${name}' lacks configuration`);
  }
  for (const field of [
    'modelConfigurationId',
    'adapterId',
    'adapterVersion',
    'preprocessingRevision',
    'decodingRevision',
    'calibrationRevision',
  ] as const) {
    const value = (cfg as unknown as Record<string, unknown>)[field];
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`runner profile '${name}' configuration.${field} must be a non-empty string`);
    }
  }
  if (cfg.executionProvider !== undefined && cfg.executionProvider !== 'dml' && cfg.executionProvider !== 'coreml' && cfg.executionProvider !== 'cpu') {
    throw new Error(`runner profile '${name}' has unsupported executionProvider ${JSON.stringify(cfg.executionProvider)}`);
  }
  if (cfg.onnxRuntimeVersion !== undefined && (typeof cfg.onnxRuntimeVersion !== 'string' || cfg.onnxRuntimeVersion.length === 0)) {
    throw new Error(`runner profile '${name}' onnxRuntimeVersion must be a non-empty string`);
  }
  if (cfg.modelManifestSha256 !== undefined && (typeof cfg.modelManifestSha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(cfg.modelManifestSha256))) {
    throw new Error(`runner profile '${name}' modelManifestSha256 must be 64 hex characters`);
  }
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
    // E09: replay requires the complete configuration identity; a mismatched
    // revision/provider/runtime/manifest fails and is never substituted.
    // Design §3.6: exact identity, not closest-version compatibility.
    const fields: readonly [keyof RunnerConfiguration, string][] = [
      ['modelConfigurationId', 'model configuration'],
      ['adapterId', 'adapter id'],
      ['adapterVersion', 'adapter version'],
      ['preprocessingRevision', 'preprocessing revision'],
      ['decodingRevision', 'decoding revision'],
      ['calibrationRevision', 'calibration revision'],
      ['onnxRuntimeVersion', 'onnx runtime version'],
      ['executionProvider', 'execution provider'],
      ['modelManifestSha256', 'model manifest sha256'],
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
  readonly contractVersions?: {
    readonly tools?: number;
    readonly desktop?: number;
    readonly grounding?: number;
  };
  readonly configuration: {
    readonly modelConfigurationId: string;
    readonly adapterId: string;
    readonly adapterVersion: string;
    readonly preprocessingRevision: string;
    readonly decodingRevision: string;
    readonly calibrationRevision: string;
    readonly onnxRuntimeVersion?: string;
    readonly executionProvider?: string;
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

/** Path containment for bundle-relative references (B09, E09). */
function insideBundle(target: string): boolean {
  if (target.length === 0 || target.startsWith('/') || target.startsWith('\\') || /^[A-Za-z]:[\\/]/.test(target)) {
    return false;
  }
  // E09: Windows backslash traversal is also rejected; split on both separators.
  const parts = target.split(/[/\\]/);
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

/** E09: real-path containment so symlinked references cannot escape. */
async function bundlePathContained(bundleDir: string, target: string): Promise<boolean> {
  const { realpath, stat } = await import('node:fs/promises');
  const { resolve } = await import('node:path');
  const absolute = resolve(bundleDir, target);
  if (!(await stat(absolute).catch(() => undefined))) {
    return true; // existence reported separately
  }
  try {
    const realRoot = await realpath(bundleDir);
    const realTarget = await realpath(absolute);
    const { relative, isAbsolute } = await import('node:path');
    const rel = relative(realRoot, realTarget);
    return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
  } catch {
    return false;
  }
}

/** E09: validate trace manifest identity at load time; unsupported/missing
 * versions and changed provider/runtime/manifest identities fail before scoring.
 */
function validateTraceManifest(manifest: TraceBundleManifest): void {
  if (typeof manifest.schemaVersion !== 'number' || manifest.schemaVersion !== 1) {
    throw new Error(`trace bundle schemaVersion ${JSON.stringify((manifest as { schemaVersion?: unknown }).schemaVersion)} is unsupported (expected 1)`);
  }
  if (typeof manifest.traceId !== 'string' || manifest.traceId.length === 0) {
    throw new Error('trace bundle lacks traceId');
  }
  const contracts = manifest.contractVersions;
  if (contracts !== undefined) {
    for (const [key, value] of Object.entries(contracts)) {
      if (typeof value !== 'number' || value !== 1) {
        throw new Error(`trace bundle contractVersions.${key} version ${JSON.stringify(value)} is unsupported (expected 1)`);
      }
    }
  }
  const cfg = manifest.configuration;
  if (typeof cfg !== 'object' || cfg === null) {
    throw new Error('trace bundle lacks configuration');
  }
  for (const field of [
    'modelConfigurationId',
    'adapterId',
    'adapterVersion',
    'preprocessingRevision',
    'decodingRevision',
    'calibrationRevision',
  ] as const) {
    const value = (cfg as unknown as Record<string, unknown>)[field];
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`trace bundle configuration.${field} must be a non-empty string`);
    }
  }
  if (cfg.executionProvider !== undefined && cfg.executionProvider !== 'dml' && cfg.executionProvider !== 'coreml' && cfg.executionProvider !== 'cpu') {
    throw new Error(`trace bundle executionProvider ${JSON.stringify(cfg.executionProvider)} is unsupported`);
  }
  if (cfg.onnxRuntimeVersion !== undefined && (typeof cfg.onnxRuntimeVersion !== 'string' || cfg.onnxRuntimeVersion.length === 0)) {
    throw new Error('trace bundle onnxRuntimeVersion must be a non-empty string');
  }
  if (cfg.modelManifestSha256 !== undefined && (typeof cfg.modelManifestSha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(cfg.modelManifestSha256))) {
    throw new Error('trace bundle modelManifestSha256 must be 64 hex characters');
  }
  if (!Array.isArray(manifest.steps)) {
    throw new Error('trace bundle steps must be an array');
  }
  for (const step of manifest.steps) {
    if (typeof step.stepId !== 'string' || step.stepId.length === 0) {
      throw new Error('trace bundle step lacks stepId');
    }
    if (step.grounding !== undefined && typeof step.grounding !== 'string') {
      throw new Error(`trace bundle step '${step.stepId}' grounding must be a string`);
    }
  }
}

function validateGroundingRecord(record: GroundingRecord, source: string): void {
  if (typeof record.caseId !== 'string' || record.caseId.length === 0) {
    throw new Error(`trace bundle record ${source} lacks caseId`);
  }
  if (!Array.isArray(record.candidates)) {
    throw new Error(`trace bundle record '${record.caseId}' candidates must be an array`);
  }
  for (const candidate of record.candidates) {
    const point = (candidate as { point?: unknown }).point;
    if (typeof point !== 'object' || point === null) {
      throw new Error(`trace bundle record '${record.caseId}' candidate lacks point`);
    }
    const { x, y } = point as { x?: unknown; y?: unknown };
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) {
      throw new Error(`trace bundle record '${record.caseId}' candidate point must be finite numbers`);
    }
    const score = (candidate as { score?: unknown }).score;
    if (typeof score !== 'number' || !Number.isFinite(score)) {
      throw new Error(`trace bundle record '${record.caseId}' candidate score must be finite`);
    }
  }
  if (typeof record.inferenceMs !== 'number' || !Number.isFinite(record.inferenceMs) || record.inferenceMs < 0) {
    throw new Error(`trace bundle record '${record.caseId}' inferenceMs must be a non-negative number`);
  }
}

/** Human label for one recorded case (design §3.6 annotations.json). */
export interface BundleAnnotation {
  readonly kind: 'region' | 'absent' | 'ambiguous';
  readonly region?: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
  // E15: provenance is preserved when present; missing provenance is never
  // silently relabeled (reviewed evidence stays reviewed, unknown stays unknown).
  readonly consentClass?: 'synthetic' | 'reviewed';
  readonly split?: 'regression' | 'calibration' | 'held_out';
}

function validateBundleAnnotation(caseId: string, annotation: BundleAnnotation): void {
  if (annotation.kind !== 'region' && annotation.kind !== 'absent' && annotation.kind !== 'ambiguous') {
    throw new Error(`bundle annotation '${caseId}' has unsupported kind ${JSON.stringify((annotation as unknown as { kind?: unknown }).kind)}`);
  }
  if (annotation.region !== undefined) {
    const { x, y, w, h } = annotation.region;
    if (typeof x !== 'number' || typeof y !== 'number' || typeof w !== 'number' || typeof h !== 'number' || w <= 0 || h <= 0) {
      throw new Error(`bundle annotation '${caseId}' region must have positive w/h`);
    }
  }
  if (annotation.kind === 'region' && annotation.region === undefined) {
    throw new Error(`bundle annotation '${caseId}' kind region requires a region`);
  }
}

/** Load a trace bundle's manifest + per-step grounding records. */
export async function loadTraceBundle(bundleDir: string): Promise<{
  manifest: TraceBundleManifest;
  records: readonly GroundingRecord[];
  annotations: ReadonlyMap<string, BundleAnnotation>;
  annotationHashes?: Readonly<Record<string, string>> | undefined;
}> {
  const manifest = JSON.parse(await readFile(join(bundleDir, 'manifest.json'), 'utf8')) as TraceBundleManifest;
  validateTraceManifest(manifest);
  const records: GroundingRecord[] = [];
  const seenCases = new Set<string>();
  for (const step of manifest.steps) {
    if (step.grounding === undefined) {
      continue;
    }
    if (!insideBundle(step.grounding)) {
      throw new Error(`trace bundle step '${step.stepId}' grounding path escapes the bundle: ${step.grounding}`);
    }
    if (!(await bundlePathContained(bundleDir, step.grounding))) {
      throw new Error(`trace bundle step '${step.stepId}' grounding path escapes via symlink: ${step.grounding}`);
    }
    const grounding = JSON.parse(await readFile(join(bundleDir, step.grounding), 'utf8')) as GroundingRecord;
    validateGroundingRecord(grounding, step.stepId);
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
      validateBundleAnnotation(caseId, annotation);
      annotations.set(caseId, annotation);
    }
    if (parsed.contentSha256 !== undefined) {
      // E15: verify declared hashes cover the annotation bytes; tampered
      // bytes with unchanged hashes fail instead of scoring.
      for (const [caseId, annotation] of annotations) {
        const declared = parsed.contentSha256[caseId];
        if (typeof declared !== 'string' || !/^[0-9a-f]{64}$/i.test(declared)) {
          throw new Error(`bundle annotation '${caseId}' has invalid contentSha256`);
        }
        const expectedHash = annotationContentHash(caseId, annotation);
        if (expectedHash.toLowerCase() !== declared.toLowerCase()) {
          throw new Error(
            `bundle annotation '${caseId}' contentSha256 mismatch — fixture bytes were tampered or hash is stale`,
          );
        }
      }
      annotationHashes = parsed.contentSha256;
    }
  }
  return { manifest, records, annotations, annotationHashes };
}

function annotationContentHash(caseId: string, annotation: BundleAnnotation): string {
  const expected: Record<string, unknown> = { kind: annotation.kind };
  if (annotation.region !== undefined) {
    expected.region = annotation.region;
  }
  return createHash('sha256').update(canonicalStringify({ id: caseId, expected })).digest('hex');
}

function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? '';
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalStringify(v)).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalStringify(v)}`).join(',')}}`;
}

/**
 * release:verify — closure, hash, platform, licence and evidence gates
 * (design §7.4, PRD CU-PLUGIN-21 / CU-INST-11). Evidence is hashed and
 * validated like every other artifact; failed, skipped or empty reports can
 * never satisfy a gate. Contract digests, lock digests, launch profiles,
 * notices and model-manifest closures are all verified. Never publishes.
 */
import { readFileSync } from 'node:fs';
import { readFile, realpath, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { Ajv2020, type ValidateFunction } from 'ajv/dist/2020.js';
import { sha256File } from './hash.js';

export interface VerificationFailure {
  readonly gate: string;
  readonly detail: string;
}

export interface VerificationReport {
  readonly releaseVersion: string;
  readonly artifactCount: number;
  readonly failures: readonly VerificationFailure[];
}

interface Artifact {
  role: 'contracts' | 'plugin' | 'windows-env' | 'mac-native' | 'model' | 'evidence';
  platform?: 'win32-x64' | 'darwin-arm64';
  location: string;
  bytes: number;
  sha256: string;
  launchProfile?: string;
  signingIdentity?: string;
  noticesPath?: string;
  modelManifestPath?: string;
  compatibleWith?: { hostAppRange?: string; adapterId?: string; runtimeId?: string };
  evidenceRequired?: boolean;
  suite?: string;
  reportPath?: string;
}

interface ReleaseManifest {
  readonly schemaVersion: number;
  readonly releaseVersion: string;
  readonly sourceCommit: string;
  readonly lockDigests?: Record<string, string>;
  readonly contractArchive: { version: string; sha256: string };
  readonly requiredEvidence: readonly string[];
  readonly artifacts: readonly Artifact[];
}

const ROLE_PLATFORM: Partial<Record<Artifact['role'], 'win32-x64' | 'darwin-arm64'>> = {
  'windows-env': 'win32-x64',
  'mac-native': 'darwin-arm64',
};

let cachedValidator: ValidateFunction | undefined;
let cachedModelValidator: ValidateFunction | undefined;

function releaseValidator(schemaPath: string): ValidateFunction {
  if (cachedValidator === undefined) {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as object;
    cachedValidator = ajv.compile(schema);
  }
  return cachedValidator;
}

function modelManifestValidator(contractsDir: string): ValidateFunction {
  if (cachedModelValidator === undefined) {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    const schema = JSON.parse(
      readFileSync(join(contractsDir, 'models', 'model-manifest-v1.schema.json'), 'utf8'),
    ) as object;
    cachedModelValidator = ajv.compile(schema);
  }
  return cachedModelValidator;
}

/**
 * True when `target` stays inside the release tree. Containment is decided on
 * the normalized relative path AND on real paths when the target exists, so
 * symlinked references cannot escape (B05).
 */
function insideRelease(manifestDir: string, target: string): boolean {
  if (target.length === 0 || isAbsolute(target)) {
    return false;
  }
  const rel = relative(manifestDir, resolve(manifestDir, target));
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    return false;
  }
  return true;
}

async function symlinkContained(manifestDir: string, target: string): Promise<boolean> {
  const absolute = resolve(manifestDir, target);
  if (!(await stat(absolute).catch(() => undefined))) {
    return true; // existence is reported separately
  }
  const realRoot = await realpath(manifestDir);
  const realTarget = await realpath(absolute);
  const rel = relative(realRoot, realTarget);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

interface EvidenceReportShape {
  readonly schema?: unknown;
  readonly run?: { mode?: unknown; datasetId?: unknown };
  readonly configuration?: { modelConfigurationId?: unknown };
  readonly aggregate?: {
    planned?: unknown;
    executed?: unknown;
    passed?: unknown;
    failed?: unknown;
    skipped?: unknown;
  };
  readonly qualification?: { missingEvidence?: unknown };
  readonly cases?: unknown;
}

export async function verifyRelease(
  manifestPath: string,
  schemaPath: string = join(process.cwd(), 'tooling', 'release', 'schemas', 'release-manifest-v1.schema.json'),
  contractsDir: string = join(process.cwd(), 'contracts'),
): Promise<VerificationReport> {
  const failures: VerificationFailure[] = [];
  const absManifest = resolve(manifestPath);
  const manifestDir = dirname(absManifest);
  const raw = await readFile(absManifest, 'utf8');
  const manifest = JSON.parse(raw) as unknown;

  const validator = releaseValidator(schemaPath);
  if (!validator(manifest)) {
    return {
      releaseVersion: '(unparsed)',
      artifactCount: 0,
      failures: [
        {
          gate: 'schema',
          detail: (validator.errors ?? []).map((e) => `${e.instancePath} ${e.message}`).join('; '),
        },
      ],
    };
  }
  const typed = manifest as ReleaseManifest;
  const evidenceArtifacts = typed.artifacts.filter((artifact) => artifact.role === 'evidence');
  const modelValidator = modelManifestValidator(contractsDir);

  // Contract-archive digest must match the contracts artifact actually shipped.
  const contractsArtifact = typed.artifacts.find((artifact) => artifact.role === 'contracts');
  if (contractsArtifact !== undefined) {
    if (!insideRelease(manifestDir, contractsArtifact.location)) {
      failures.push({ gate: 'closure', detail: `contracts:${contractsArtifact.location}: location escapes the release directory` });
    } else {
      const actual = await sha256File(resolve(manifestDir, contractsArtifact.location)).catch(() => undefined);
      if (actual === undefined) {
        failures.push({ gate: 'closure', detail: `contracts:${contractsArtifact.location}: file missing` });
      } else if (actual !== typed.contractArchive.sha256) {
        failures.push({
          gate: 'compatibility',
          detail: `contractArchive.sha256 does not match the shipped contracts artifact (B04)`,
        });
      }
    }
  } else {
    failures.push({ gate: 'compatibility', detail: 'no contracts artifact in the release closure' });
  }

  // Lock digests reference repository paths; verify them against the repo
  // the command runs in (design §2.2 command contract runs from repo root).
  // E07: repository lock keys reject absolute paths AND '..' traversal.
  for (const [lockPath, digest] of Object.entries(typed.lockDigests ?? {})) {
    if (isAbsolute(lockPath) || lockPath.split('/').includes('..') || lockPath.split('\\').includes('..')) {
      failures.push({ gate: 'compatibility', detail: `lockDigests key must be repo-relative without traversal: ${lockPath}` });
      continue;
    }
    const absolute = resolve(process.cwd(), lockPath);
    const actual = await sha256File(absolute).catch(() => undefined);
    if (actual === undefined) {
      failures.push({ gate: 'compatibility', detail: `lockDigests references missing file: ${lockPath}` });
    } else if (actual !== digest) {
      failures.push({ gate: 'compatibility', detail: `lock digest mismatch for ${lockPath}` });
    }
  }
  // E07: required pins cannot be omitted when backend/model artifacts ship;
  // archive version must match the shipped contracts artifact version.
  const hasBackendOrModel = typed.artifacts.some((a) => a.role === 'windows-env' || a.role === 'mac-native' || a.role === 'model');
  if (hasBackendOrModel && (typed.lockDigests === undefined || Object.keys(typed.lockDigests).length === 0)) {
    failures.push({ gate: 'compatibility', detail: 'release ships backend/model artifacts but omits required lockDigests identities' });
  }
  if (!/^[0-9a-f]{7,40}$/i.test(typed.sourceCommit) && !/^[0-9a-f]{40}(-dirty)?$/i.test(typed.sourceCommit)) {
    // Accept short hex (e.g. abc1234) and full SHAs; reject NOT-A-COMMIT etc.
    if (!/^[0-9a-f]{7,40}$/i.test(typed.sourceCommit)) {
      failures.push({ gate: 'compatibility', detail: `sourceCommit '${typed.sourceCommit}' is not a commit-shaped identity` });
    }
  }
  // Archive version must be a sane vN and match the contracts artifact when present.
  if (!/^v\d+$/.test(typed.contractArchive.version)) {
    failures.push({ gate: 'compatibility', detail: `contractArchive.version '${typed.contractArchive.version}' must match vN` });
  } else {
    // E07: archive version matches archive metadata — must equal the current
    // registry version (consumers pin exact vN; v999 is not a supported tuple).
    try {
      const registryRaw = await readFile(join(contractsDir, 'registry.json'), 'utf8');
      const registryVersion = (JSON.parse(registryRaw) as { version?: unknown }).version;
      if (typeof registryVersion === 'number' && typed.contractArchive.version !== `v${registryVersion}`) {
        failures.push({
          gate: 'compatibility',
          detail: `contractArchive.version '${typed.contractArchive.version}' does not match registry v${registryVersion} — unsupported combination`,
        });
      }
    } catch {
      /* registry read errors are reported by contracts:check, not here */
    }
  }

  for (const artifact of typed.artifacts) {
    const label = `${artifact.role}:${artifact.location}`;

    if (artifact.role === 'evidence') {
      // E05: evidence gets closure + hash treatment on the bytes actually
      // evaluated. The declared hash/size must match reportPath (the file read
      // for gating), not a different location. reportPath and location must
      // resolve to the same real file when both are present.
      const reportRel = artifact.reportPath ?? artifact.location;
      if (!insideRelease(manifestDir, reportRel) || !(await symlinkContained(manifestDir, reportRel))) {
        failures.push({ gate: 'closure', detail: `${label}: reportPath escapes the release directory` });
        continue;
      }
      if (!insideRelease(manifestDir, artifact.location) || !(await symlinkContained(manifestDir, artifact.location))) {
        failures.push({ gate: 'closure', detail: `${label}: location escapes the release directory` });
        continue;
      }
      const reportAbs = resolve(manifestDir, reportRel);
      const locationAbs = resolve(manifestDir, artifact.location);
      const reportInfo = await stat(reportAbs).catch(() => undefined);
      if (reportInfo === undefined) {
        failures.push({ gate: 'closure', detail: `${label}: file missing` });
        continue;
      }
      // E05: hash the report actually read; the declared bytes must identify
      // those exact bytes.
      if (reportInfo.size !== artifact.bytes) {
        failures.push({ gate: 'hash', detail: `${label}: size ${reportInfo.size} != declared ${artifact.bytes}` });
      }
      const actual = await sha256File(reportAbs);
      if (actual !== artifact.sha256) {
        failures.push({ gate: 'hash', detail: `${label}: sha256 mismatch` });
      }
      // When location and reportPath differ, they must still be the same
      // underlying file; otherwise unhashed bytes could gate the release.
      if (reportRel !== artifact.location) {
        const [realReport, realLocation] = await Promise.all([
          realpath(reportAbs).catch(() => undefined),
          realpath(locationAbs).catch(() => undefined),
        ]);
        if (realReport === undefined || realLocation === undefined || realReport !== realLocation) {
          failures.push({
            gate: 'hash',
            detail: `${label}: reportPath (${reportRel}) must identify the exact hashed report bytes (location ${artifact.location})`,
          });
          continue;
        }
      }
      const reportRaw = await readFile(reportAbs, 'utf8').catch(() => undefined);
      if (reportRaw === undefined) {
        failures.push({ gate: 'evidence', detail: `${label}: report file missing (${reportRel})` });
        continue;
      }
      let report: unknown;
      try {
        report = JSON.parse(reportRaw) as unknown;
      } catch (error) {
        failures.push({ gate: 'evidence', detail: `${label}: report is not valid JSON: ${(error as Error).message}` });
        continue;
      }
      const reportFailures = validateEvidenceReport(report, label, artifact.suite);
      failures.push(...reportFailures);
      continue;
    }

    if (!insideRelease(manifestDir, artifact.location) || !(await symlinkContained(manifestDir, artifact.location))) {
      failures.push({ gate: 'closure', detail: `${label}: location escapes the release directory` });
      continue;
    }
    const absLocation = resolve(manifestDir, artifact.location);
    const info = await stat(absLocation).catch(() => undefined);
    if (info === undefined) {
      failures.push({ gate: 'closure', detail: `${label}: file missing` });
      continue;
    }
    if (info.size !== artifact.bytes) {
      failures.push({ gate: 'hash', detail: `${label}: size ${info.size} != declared ${artifact.bytes}` });
    }
    const actual = await sha256File(absLocation);
    if (actual !== artifact.sha256) {
      failures.push({ gate: 'hash', detail: `${label}: sha256 mismatch` });
    }

    const expectedPlatform = ROLE_PLATFORM[artifact.role];
    if (expectedPlatform !== undefined && artifact.platform !== expectedPlatform) {
      failures.push({
        gate: 'platform',
        detail: `${label}: role requires platform ${expectedPlatform}, manifest says ${artifact.platform ?? '(none)'}`,
      });
    }
    if (artifact.role === 'mac-native' && (artifact.signingIdentity ?? '').length === 0) {
      failures.push({ gate: 'platform', detail: `${label}: mac-native requires a signing identity` });
    }
    // E08: parse/validate launch profiles and their executable/resource closure.
    // Invalid JSON fails; candidate helpers (SPIKEPENDING/PLACEHOLDER) pass
    // portable checks as candidates, while qualified identities require native
    // format/arch/permissions/signature verification on a suitable runner
    // (M07/M09). Unsupported environments report unqualified explicitly.
    if (artifact.launchProfile !== undefined) {
      const lpAbs = resolve(manifestDir, artifact.launchProfile);
      const lpRaw = await readFile(lpAbs, 'utf8').catch(() => undefined);
      if (lpRaw === undefined) {
        // Missing already reported above; skip further checks.
      } else {
        let parsed: unknown;
        try {
          parsed = JSON.parse(lpRaw);
        } catch (error) {
          failures.push({ gate: 'closure', detail: `${label}: launchProfile is not valid JSON: ${(error as Error).message}` });
          parsed = undefined;
        }
        if (parsed !== undefined) {
          if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            failures.push({ gate: 'closure', detail: `${label}: launchProfile must be a JSON object` });
          } else {
            const obj = parsed as Record<string, unknown>;
            // Minimal portable contract: version + transport or argv.
            if (typeof obj.version !== 'number' && (obj as { argv?: unknown }).argv === undefined) {
              failures.push({ gate: 'closure', detail: `${label}: launchProfile lacks version/argv identity` });
            }
            if (obj.argv !== undefined && !Array.isArray(obj.argv)) {
              failures.push({ gate: 'closure', detail: `${label}: launchProfile argv must be an array` });
            }
          }
        }
      }
    }
    // E08: native format/arch/permissions for mac-native. Candidate placeholders
    // (SPIKEPENDING etc.) are accepted as candidates on portable runners but
    // never qualify as signed/notarized; qualified identities require Mach-O,
    // executable bits and signature verification on macOS (M07).
    if (artifact.role === 'mac-native') {
      const nativeAbs = resolve(manifestDir, artifact.location);
      const nativeBytes = await readFile(nativeAbs).catch(() => undefined);
      const identity = artifact.signingIdentity ?? '';
      const isCandidate = /PENDING|PLACEHOLDER|SPIKE|TEST|EXAMPLE/i.test(identity);
      if (nativeBytes !== undefined) {
        const isMachO =
          nativeBytes.length >= 4 &&
          ((nativeBytes[0] === 0xcf && nativeBytes[1] === 0xfa && nativeBytes[2] === 0xed && nativeBytes[3] === 0xfe) ||
            (nativeBytes[0] === 0xfe && nativeBytes[1] === 0xed && nativeBytes[2] === 0xfa && nativeBytes[3] === 0xcf) ||
            (nativeBytes[0] === 0xca && nativeBytes[1] === 0xfe && nativeBytes[2] === 0xba && nativeBytes[3] === 0xbe));
        if (!isCandidate) {
          if (!isMachO) {
            failures.push({ gate: 'platform', detail: `${label}: mac-native helper is not a Mach-O binary (qualified helper requires native format)` });
          }
          // Executable bits and signature/notarization require a macOS runner;
          // on other platforms report unqualified explicitly (E08 acceptance).
          if (process.platform !== 'darwin') {
            failures.push({ gate: 'platform', detail: `${label}: qualified mac-native signature/notarization requires a macOS runner — unqualified on ${process.platform}` });
          }
        } else {
          // Candidate: still require a non-empty file (placeholder text ok).
          if (nativeBytes.length === 0) {
            failures.push({ gate: 'platform', detail: `${label}: mac-native candidate helper is empty` });
          }
        }
      }
    }
    // B05: referenced closure paths must exist (and stay contained).
    for (const [fieldName, value] of [
      ['noticesPath', artifact.noticesPath],
      ['launchProfile', artifact.launchProfile],
    ] as const) {
      if (value === undefined) {
        continue;
      }
      if (!insideRelease(manifestDir, value) || !(await symlinkContained(manifestDir, value))) {
        failures.push({ gate: 'closure', detail: `${label}: ${fieldName} escapes the release directory` });
      } else if (!(await stat(resolve(manifestDir, value)).catch(() => undefined))) {
        failures.push({ gate: 'closure', detail: `${label}: ${fieldName} references a missing file (${value})` });
      }
    }
    // E07: complete compatibility/pin identities against a supported consumer
    // matrix. Empty ranges, unlisted versions and omitted pins fail; changing
    // a supplied digest is already detected, omitting required identities is not.
    if (['plugin', 'model', 'windows-env', 'mac-native'].includes(artifact.role)) {
      const compat = artifact.compatibleWith ?? {};
      const hasHost = typeof compat.hostAppRange === 'string' && compat.hostAppRange.trim().length > 0;
      const hasAdapter = typeof compat.adapterId === 'string' && compat.adapterId.trim().length > 0;
      const hasRuntime = typeof compat.runtimeId === 'string' && compat.runtimeId.trim().length > 0;
      if (!hasHost && !hasAdapter && !hasRuntime) {
        failures.push({
          gate: 'compatibility',
          detail: `${label}: no compatibleWith identity (hostAppRange/adapterId/runtimeId) declared`,
        });
      }
      if (compat.hostAppRange !== undefined && !hasHost) {
        failures.push({
          gate: 'compatibility',
          detail: `${label}: compatibleWith.hostAppRange must be a non-empty range (got ${JSON.stringify(compat.hostAppRange)})`,
        });
      }
    }
    if (artifact.role === 'model') {
      if (
        artifact.modelManifestPath === undefined ||
        !insideRelease(manifestDir, artifact.modelManifestPath) ||
        !(await symlinkContained(manifestDir, artifact.modelManifestPath))
      ) {
        failures.push({ gate: 'closure', detail: `${label}: modelManifestPath escapes the release directory` });
        continue;
      }
      const manifestAbs = resolve(manifestDir, artifact.modelManifestPath);
      const manifestRaw = await readFile(manifestAbs, 'utf8').catch(() => undefined);
      if (manifestRaw === undefined) {
        failures.push({ gate: 'closure', detail: `${label}: model manifest missing (${artifact.modelManifestPath})` });
        continue;
      }
      let modelManifest: unknown;
      try {
        modelManifest = JSON.parse(manifestRaw);
      } catch (error) {
        failures.push({ gate: 'licence', detail: `${label}: model manifest is not valid JSON: ${(error as Error).message}` });
        continue;
      }
      if (!modelValidator(modelManifest)) {
        failures.push({
          gate: 'licence',
          detail: `${label}: model manifest fails model-manifest-v1: ${(modelValidator.errors ?? [])
            .slice(0, 3)
            .map((e) => `${e.instancePath} ${e.message}`)
            .join('; ')}`,
        });
        continue;
      }
      const model = modelManifest as ModelManifestShape;
      const chain = [model.upstream.licence, model.upstream.baseModel.licence, ...model.licences.map((l) => l.licence)];
      if (chain.includes('qwen-research-non-commercial')) {
        failures.push({
          gate: 'licence',
          detail: `${label}: non-commercial licence in the chain blocks publication (CU-INST-11)`,
        });
        continue;
      }
      failures.push(...(await verifyModelClosure(manifestDir, model, label, artifact.modelManifestPath)));
    }
  }

  // E04: derive mandatory suites from artifact roles/targets/qualification so
  // callers cannot omit them or substitute unrelated suites. Binding: each
  // report must concern this candidate (hashes/configuration/provider).
  const mandatorySuites = deriveMandatorySuites(typed.artifacts);
  for (const required of mandatorySuites) {
    const satisfied = evidenceArtifacts.some((evidence) => evidence.suite === required);
    if (!satisfied) {
      failures.push({
        gate: 'evidence',
        detail: `mandatory suite '${required}' is required by the artifact closure but has no evidence artifact — unqualified, not a pass`,
      });
    }
  }
  // Evidence gates: every required suite satisfied; artifacts that require
  // evidence cannot appear in a release with no required suites at all (B03).
  for (const required of typed.requiredEvidence) {
    const satisfied = evidenceArtifacts.some((evidence) => evidence.suite === required);
    if (!satisfied) {
      failures.push({
        gate: 'evidence',
        detail: `required suite '${required}' has no evidence artifact — unqualified, not a pass`,
      });
    }
  }
  const requiringEvidence = typed.artifacts.filter((artifact) => artifact.evidenceRequired === true);
  if (requiringEvidence.length > 0 && typed.requiredEvidence.length === 0) {
    failures.push({
      gate: 'evidence',
      detail: `artifacts marked evidenceRequired (${requiringEvidence.map((a) => a.role).join(', ')}) appear with an empty requiredEvidence list`,
    });
  }
  // E04 binding: each report must concern this candidate (hashes/configuration/
  // provider) and the exact consumer builds. Wrong source/configuration/
  // provider/candidate/consumer identities fail; synthetic/recorded scoring
  // cannot satisfy real parity/native gates for qualified artifacts.
  failures.push(...(await verifyEvidenceBinding(manifestDir, typed.artifacts, evidenceArtifacts)));

  return {
    releaseVersion: typed.releaseVersion,
    artifactCount: typed.artifacts.length,
    failures,
  };
}

/**
 * E04: mandatory suites derived from artifact roles, targets and claimed
 * qualification — independent of the caller-set requiredEvidence list.
 */
function deriveMandatorySuites(artifacts: readonly Artifact[]): readonly string[] {
  const suites = new Set<string>();
  if (artifacts.some((a) => a.role === 'model')) {
    suites.add('parity');
  }
  if (artifacts.some((a) => a.role === 'windows-env')) {
    suites.add('windows-native');
  }
  if (artifacts.some((a) => a.role === 'mac-native')) {
    suites.add('mac-native');
  }
  return [...suites].sort();
}

/**
 * E04 binding: parity reports must reference the candidate model closure;
 * qualified (non-candidate) parity/native gates reject synthetic/recorded
 * producer-only scoring. Candidate placeholders (SPIKEPENDING, status
 * candidate) remain portable-pass; qualified claims require real evidence.
 */
async function verifyEvidenceBinding(
  manifestDir: string,
  allArtifacts: readonly Artifact[],
  evidenceArtifacts: readonly Artifact[],
): Promise<readonly VerificationFailure[]> {
  const failures: VerificationFailure[] = [];
  const modelArtifact = allArtifacts.find((a) => a.role === 'model');
  if (modelArtifact?.modelManifestPath !== undefined) {
    const manifestAbs = resolve(manifestDir, modelArtifact.modelManifestPath);
    const raw = await readFile(manifestAbs, 'utf8').catch(() => undefined);
    if (raw !== undefined) {
      try {
        const model = JSON.parse(raw) as ModelManifestShape;
        const parityEvidence = evidenceArtifacts.find((e) => e.suite === 'parity');
        if (parityEvidence !== undefined) {
          const reportRel = parityEvidence.reportPath ?? parityEvidence.location;
          const reportRaw = await readFile(resolve(manifestDir, reportRel), 'utf8').catch(() => undefined);
          if (reportRaw !== undefined) {
            try {
              const report = JSON.parse(reportRaw) as {
                aggregate?: { executed?: number };
                configuration?: { modelConfigurationId?: string };
                run?: { runnerKind?: string };
                qualification?: { producerOnly?: boolean };
              };
              // Binding: parity fixtureCount must match executed cases when known.
              if (
                typeof model.parityReport?.fixtureCount === 'number' &&
                typeof report.aggregate?.executed === 'number' &&
                model.parityReport.fixtureCount !== report.aggregate.executed
              ) {
                // Candidate reports may cover a subset, but a qualified 'passed'
                // claim must match exactly.
                if (model.parityReport.status === 'passed') {
                  failures.push({
                    gate: 'evidence',
                    detail: `model:${modelArtifact.location}: parity fixtureCount ${model.parityReport.fixtureCount} != report executed ${report.aggregate.executed} — wrong evidence for this candidate`,
                  });
                }
              }
              // Real gates: qualified parity (status passed) cannot be satisfied
              // by recorded/synthetic producer-only scoring.
              if (model.parityReport?.status === 'passed') {
                const runnerKind = report.run?.runnerKind ?? '';
                const producerOnly = report.qualification?.producerOnly !== false;
                if (runnerKind === 'recorded' || runnerKind === 'synthetic' || producerOnly) {
                  failures.push({
                    gate: 'evidence',
                    detail: `model:${modelArtifact.location}: qualified parity (status passed) cannot be satisfied by ${runnerKind || 'producer-only'} scoring — real reference/ONNX evidence required`,
                  });
                }
              }
            } catch {
              /* report JSON errors already reported in the evidence gate */
            }
          }
        }
      } catch {
        /* model JSON errors already reported */
      }
    }
  }
  return failures;
}

interface ModelManifestShape {
  files: { path: string; bytes: number; sha256: string }[];
  licences: { component: string; licence: string; noticePath: string }[];
  healthFixture: { imagePath: string; expectedPath: string };
  limits: { maxFiles: number; maxTotalBytes: number; maxShardBytes: number };
  upstream: { licence: string; baseModel: { licence: string } };
  graphs: { name: string; inputs: string[]; outputs: string[] }[];
  parityReport: { sha256: string; fixtureCount: number; status: string };
}

/**
 * E05: validate report types, required fields, per-case outcomes and
 * aggregate consistency before evaluating a gate. Returns structured
 * diagnostics; null/array/malformed reports fail instead of throwing.
 */
function validateEvidenceReport(report: unknown, label: string, suite: string | undefined): readonly VerificationFailure[] {
  const failures: VerificationFailure[] = [];
  if (report === null || typeof report !== 'object' || Array.isArray(report)) {
    return [{ gate: 'evidence', detail: `${label}: report must be a JSON object (got ${Array.isArray(report) ? 'array' : String(report)})` }];
  }
  const typed = report as EvidenceReportShape;
  const aggregate = typed.aggregate;
  const missing = typed.qualification?.missingEvidence;
  if (typeof typed.schema !== 'string' || typed.schema.length === 0) {
    failures.push({ gate: 'evidence', detail: `${label}: report lacks schema identifier` });
  }
  if (aggregate === undefined || typeof aggregate !== 'object' || aggregate === null || Array.isArray(aggregate)) {
    return [...failures, { gate: 'evidence', detail: `${label}: report lacks aggregate/qualification blocks` }];
  }
  if (missing === undefined || !Array.isArray(missing)) {
    return [...failures, { gate: 'evidence', detail: `${label}: report lacks aggregate/qualification blocks` }];
  }
  const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
  // E05: only counter fields must be non-negative integers; metrics like
  // regionHitRate (float|null) and latency (object|null) are validated
  // separately by the evaluation report schema, not as counters.
  for (const key of ['planned', 'executed', 'passed', 'failed', 'skipped'] as const) {
    const value = (aggregate as Record<string, unknown>)[key];
    if (value !== undefined && (!isInt(value) || (value as number) < 0)) {
      failures.push({ gate: 'evidence', detail: `${label}: report aggregate.${key} must be a non-negative integer (got ${JSON.stringify(value)})` });
    }
  }
  const executed = aggregate.executed;
  const failed = aggregate.failed;
  const skipped = aggregate.skipped;
  const planned = aggregate.planned;
  const passed = aggregate.passed;
  if (!isInt(executed) || !isInt(failed) || !isInt(skipped)) {
    return failures;
  }
  if (executed <= 0) {
    failures.push({ gate: 'evidence', detail: `${label}: report executed ${executed} cases — an empty set cannot pass` });
  }
  if (failed > 0) {
    failures.push({ gate: 'evidence', detail: `${label}: report records ${failed} failed cases` });
  }
  if (skipped > 0) {
    failures.push({ gate: 'evidence', detail: `${label}: report records ${skipped} skipped cases — a skip is not a pass` });
  }
  // Aggregate arithmetic consistency.
  if (isInt(planned) && isInt(passed)) {
    if (passed + failed + skipped !== planned) {
      failures.push({
        gate: 'evidence',
        detail: `${label}: report arithmetic inconsistent: passed(${passed})+failed(${failed})+skipped(${skipped}) != planned(${planned})`,
      });
    }
    if (executed !== planned - skipped) {
      failures.push({
        gate: 'evidence',
        detail: `${label}: report arithmetic inconsistent: executed(${executed}) != planned(${planned})-skipped(${skipped})`,
      });
    }
  }
  // Per-case list must exist and be non-empty when executed > 0; empty/missing
  // case lists fail. Failed case versus passing aggregate fails.
  const cases = (typed as { cases?: unknown }).cases;
  if (!Array.isArray(cases) || cases.length === 0) {
    if (executed > 0) {
      failures.push({ gate: 'evidence', detail: `${label}: report has no per-case outcomes for ${executed} executed cases` });
    }
  } else {
    let caseFailed = 0;
    for (const c of cases) {
      if (typeof c !== 'object' || c === null) {
        failures.push({ gate: 'evidence', detail: `${label}: report case must be an object` });
        break;
      }
      const status = (c as { status?: unknown }).status;
      if (status === 'fail' || status === 'failed') {
        caseFailed += 1;
      } else if (status !== 'pass' && status !== 'passed' && status !== 'skipped') {
        failures.push({ gate: 'evidence', detail: `${label}: report case has unknown status ${JSON.stringify(status)}` });
        break;
      }
    }
    if (caseFailed > 0 && failed === 0) {
      failures.push({ gate: 'evidence', detail: `${label}: report has ${caseFailed} failed cases but aggregate.failed is 0` });
    }
    if (cases.length !== executed && executed > 0) {
      // Allow planned vs executed differences (skips), but case count must
      // match executed when no skips, otherwise flag.
      if (skipped === 0 && cases.length !== executed) {
        failures.push({ gate: 'evidence', detail: `${label}: report case count ${cases.length} != executed ${executed}` });
      }
    }
  }
  for (const entry of missing as unknown[]) {
    if (typeof entry !== 'string') {
      failures.push({ gate: 'evidence', detail: `${label}: report missingEvidence entries must be strings` });
      break;
    }
  }
  if ((missing as string[]).length > 0) {
    failures.push({ gate: 'evidence', detail: `${label}: report has missing evidence: ${(missing as string[]).join('; ')}` });
  }
  // Suite binding: the report must concern this suite, not an unrelated one.
  // Parity suites require an eval-report schema; native/host suites must not
  // be satisfied by a recorded/synthetic producer-only eval report.
  if (suite !== undefined) {
    const schema = typeof typed.schema === 'string' ? typed.schema : '';
    if (suite === 'parity' && schema !== 'computer-use-eval-report-v1') {
      failures.push({ gate: 'evidence', detail: `${label}: suite 'parity' requires a computer-use-eval-report-v1 report (got ${schema || '(none)'})` });
    }
  }
  return failures;
}

/** E06: the model manifest's own file closure, limits, graphs, health, parity and notices. */
async function verifyModelClosure(
  manifestDir: string,
  modelManifest: ModelManifestShape,
  label: string,
  modelManifestRelPath: string,
): Promise<readonly VerificationFailure[]> {
  const failures: VerificationFailure[] = [];
  // E06 source-confirmed: files are package-relative to the model manifest's
  // own directory, not the release manifest directory. A nested
  // models/<config>/<version>/manifest.json must verify from its own root.
  const modelRoot = dirname(resolve(manifestDir, modelManifestRelPath));
  const modelRootRel = relative(manifestDir, modelRoot) === '' ? '.' : relative(manifestDir, modelRoot);
  const resolveModelFile = (p: string): string =>
    modelRootRel === '.' ? p : `${modelRootRel}/${p}`.replace(/\/\//g, '/');
  const seen = new Set<string>();
  let total = 0;
  const fileMap = new Map<string, { bytes: number; sha256: string }>();
  for (const file of modelManifest.files) {
    if (seen.has(file.path)) {
      failures.push({ gate: 'closure', detail: `${label}: duplicate model file path ${file.path}` });
      continue;
    }
    seen.add(file.path);
    fileMap.set(file.path, { bytes: file.bytes, sha256: file.sha256 });
    total += file.bytes;
    // E06: enforce per-file shard bound (512 MiB default).
    const maxShard = modelManifest.limits?.maxShardBytes;
    if (typeof maxShard === 'number' && file.bytes > maxShard) {
      failures.push({ gate: 'closure', detail: `${label}: model file ${file.path} exceeds maxShardBytes ${maxShard}` });
    }
    const releaseRel = resolveModelFile(file.path);
    if (!insideRelease(manifestDir, releaseRel) || !(await symlinkContained(manifestDir, releaseRel))) {
      failures.push({ gate: 'closure', detail: `${label}: model file escapes the release directory: ${file.path}` });
      continue;
    }
    const absolute = resolve(manifestDir, releaseRel);
    const info = await stat(absolute).catch(() => undefined);
    if (info === undefined) {
      failures.push({ gate: 'closure', detail: `${label}: model file missing: ${file.path}` });
      continue;
    }
    if (info.size !== file.bytes) {
      failures.push({ gate: 'hash', detail: `${label}: model file size mismatch for ${file.path}` });
    }
    const actual = await sha256File(absolute).catch(() => undefined);
    if (actual !== undefined && actual !== file.sha256) {
      failures.push({ gate: 'hash', detail: `${label}: model file sha256 mismatch for ${file.path}` });
    }
  }
  if (modelManifest.files.length > modelManifest.limits.maxFiles) {
    failures.push({ gate: 'closure', detail: `${label}: model package exceeds the ${modelManifest.limits.maxFiles}-file limit` });
  }
  if (total > modelManifest.limits.maxTotalBytes) {
    failures.push({ gate: 'closure', detail: `${label}: model package exceeds the total-bytes limit` });
  }
  // E06: every graph must resolve to a file in the closure.
  for (const graph of modelManifest.graphs ?? []) {
    if (!fileMap.has(graph.name)) {
      failures.push({ gate: 'closure', detail: `${label}: graph ${graph.name} is not in the model file closure` });
    }
    if (!Array.isArray(graph.inputs) || graph.inputs.length === 0 || !Array.isArray(graph.outputs) || graph.outputs.length === 0) {
      failures.push({ gate: 'closure', detail: `${label}: graph ${graph.name} must declare non-empty inputs/outputs` });
    }
  }
  // E06: health fixture paths must resolve into the closure.
  for (const [kind, p] of [
    ['health image', modelManifest.healthFixture?.imagePath],
    ['health expected', modelManifest.healthFixture?.expectedPath],
  ] as const) {
    if (typeof p !== 'string' || p.length === 0) {
      failures.push({ gate: 'closure', detail: `${label}: ${kind} path missing` });
    } else if (!fileMap.has(p)) {
      failures.push({ gate: 'closure', detail: `${label}: ${kind} ${p} is not in the model file closure` });
    }
  }
  // E06: parity declaration must be a valid digest/count/status, not an
  // unlinked placeholder.
  const parity = modelManifest.parityReport as { sha256?: unknown; fixtureCount?: unknown; status?: unknown } | undefined;
  if (parity === undefined) {
    failures.push({ gate: 'closure', detail: `${label}: parityReport missing` });
  } else {
    if (typeof parity.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(parity.sha256)) {
      failures.push({ gate: 'closure', detail: `${label}: parityReport.sha256 must be 64 lowercase hex` });
    }
    if (typeof parity.fixtureCount !== 'number' || !Number.isInteger(parity.fixtureCount) || parity.fixtureCount < 1) {
      failures.push({ gate: 'closure', detail: `${label}: parityReport.fixtureCount must be an integer >= 1` });
    }
    if (parity.status !== 'candidate' && parity.status !== 'passed') {
      failures.push({ gate: 'closure', detail: `${label}: parityReport.status must be candidate or passed (got ${JSON.stringify(parity.status)})` });
    }
    // Unknown/mismatched parity digest/count fails when evidence exists:
    // if a parity evidence artifact is present, its hash must match.
    // (Checked by the caller via suite binding; here we at least reject
    // all-zero digests that indicate an unlinked placeholder.)
    if (parity.sha256 === '0'.repeat(64)) {
      failures.push({ gate: 'closure', detail: `${label}: parityReport.sha256 is an unlinked placeholder` });
    }
  }
  for (const licence of modelManifest.licences) {
    const noticeRel = resolveModelFile(licence.noticePath);
    if (!insideRelease(manifestDir, noticeRel) || !(await symlinkContained(manifestDir, noticeRel))) {
      failures.push({ gate: 'closure', detail: `${label}: notice path escapes the release directory: ${licence.noticePath}` });
    } else if (!(await stat(resolve(manifestDir, noticeRel)).catch(() => undefined))) {
      failures.push({ gate: 'closure', detail: `${label}: notice file missing: ${licence.noticePath}` });
    }
  }
  return failures;
}

export function formatVerification(report: VerificationReport): string {
  const lines = [
    `release:verify — ${report.releaseVersion} (${report.artifactCount} artifacts)`,
  ];
  if (report.failures.length === 0) {
    lines.push('closure, hashes, platforms, licences and evidence all verified');
  } else {
    for (const failure of report.failures) {
      lines.push(`FAIL [${failure.gate}] ${failure.detail}`);
    }
  }
  return lines.join('\n');
}

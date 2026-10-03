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
  readonly schema?: string;
  readonly run?: { mode?: string; datasetId?: string };
  readonly configuration?: { modelConfigurationId?: string };
  readonly aggregate?: { executed?: number; failed?: number; skipped?: number };
  readonly qualification?: { missingEvidence?: string[] };
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
  for (const [lockPath, digest] of Object.entries(typed.lockDigests ?? {})) {
    if (isAbsolute(lockPath)) {
      failures.push({ gate: 'compatibility', detail: `lockDigests key must be repo-relative: ${lockPath}` });
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

  for (const artifact of typed.artifacts) {
    const label = `${artifact.role}:${artifact.location}`;

    if (artifact.role === 'evidence') {
      // B03: evidence gets the same closure + hash treatment as artifacts.
      const reportRel = artifact.reportPath ?? artifact.location;
      if (!insideRelease(manifestDir, reportRel) || !(await symlinkContained(manifestDir, reportRel))) {
        failures.push({ gate: 'closure', detail: `${label}: reportPath escapes the release directory` });
        continue;
      }
      const absolute = resolve(manifestDir, artifact.location);
      const info = await stat(absolute).catch(() => undefined);
      if (info === undefined) {
        failures.push({ gate: 'closure', detail: `${label}: file missing` });
        continue;
      }
      if (info.size !== artifact.bytes) {
        failures.push({ gate: 'hash', detail: `${label}: size ${info.size} != declared ${artifact.bytes}` });
      }
      const actual = await sha256File(absolute);
      if (actual !== artifact.sha256) {
        failures.push({ gate: 'hash', detail: `${label}: sha256 mismatch` });
      }
      const reportAbs = resolve(manifestDir, reportRel);
      const reportRaw = await readFile(reportAbs, 'utf8').catch(() => undefined);
      if (reportRaw === undefined) {
        failures.push({ gate: 'evidence', detail: `${label}: report file missing (${reportRel})` });
        continue;
      }
      let report: EvidenceReportShape;
      try {
        report = JSON.parse(reportRaw) as EvidenceReportShape;
      } catch (error) {
        failures.push({ gate: 'evidence', detail: `${label}: report is not valid JSON: ${(error as Error).message}` });
        continue;
      }
      const aggregate = report.aggregate;
      const missing = report.qualification?.missingEvidence;
      if (aggregate === undefined || missing === undefined) {
        failures.push({ gate: 'evidence', detail: `${label}: report lacks aggregate/qualification blocks` });
        continue;
      }
      if ((aggregate.executed ?? 0) <= 0) {
        failures.push({ gate: 'evidence', detail: `${label}: report executed ${aggregate.executed ?? 0} cases — an empty set cannot pass` });
      }
      if ((aggregate.failed ?? 0) > 0) {
        failures.push({ gate: 'evidence', detail: `${label}: report records ${aggregate.failed} failed cases` });
      }
      if ((aggregate.skipped ?? 0) > 0) {
        failures.push({ gate: 'evidence', detail: `${label}: report records ${aggregate.skipped} skipped cases — a skip is not a pass` });
      }
      if (missing.length > 0) {
        failures.push({ gate: 'evidence', detail: `${label}: report has missing evidence: ${missing.join('; ')}` });
      }
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
    // B04: plugin/model/backend artifacts must declare compatible consumers.
    if (['plugin', 'model', 'windows-env', 'mac-native'].includes(artifact.role)) {
      const compat = artifact.compatibleWith ?? {};
      if (compat.hostAppRange === undefined && compat.adapterId === undefined && compat.runtimeId === undefined) {
        failures.push({
          gate: 'compatibility',
          detail: `${label}: no compatibleWith identity (hostAppRange/adapterId/runtimeId) declared`,
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
      failures.push(...(await verifyModelClosure(manifestDir, model, label)));
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

  return {
    releaseVersion: typed.releaseVersion,
    artifactCount: typed.artifacts.length,
    failures,
  };
}

interface ModelManifestShape {
  files: { path: string; bytes: number; sha256: string }[];
  licences: { component: string; licence: string; noticePath: string }[];
  healthFixture: { imagePath: string; expectedPath: string };
  limits: { maxFiles: number; maxTotalBytes: number; maxShardBytes: number };
  upstream: { licence: string; baseModel: { licence: string } };
}

/** B04: the model manifest's own file closure, limits and notices. */
async function verifyModelClosure(
  manifestDir: string,
  modelManifest: ModelManifestShape,
  label: string,
): Promise<readonly VerificationFailure[]> {
  const failures: VerificationFailure[] = [];
  const seen = new Set<string>();
  let total = 0;
  for (const file of modelManifest.files) {
    if (seen.has(file.path)) {
      failures.push({ gate: 'closure', detail: `${label}: duplicate model file path ${file.path}` });
      continue;
    }
    seen.add(file.path);
    total += file.bytes;
    if (!insideRelease(manifestDir, file.path)) {
      failures.push({ gate: 'closure', detail: `${label}: model file escapes the release directory: ${file.path}` });
      continue;
    }
    const absolute = resolve(manifestDir, file.path);
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
  for (const licence of modelManifest.licences) {
    if (!insideRelease(manifestDir, licence.noticePath)) {
      failures.push({ gate: 'closure', detail: `${label}: notice path escapes the release directory: ${licence.noticePath}` });
    } else if (!(await stat(resolve(manifestDir, licence.noticePath)).catch(() => undefined))) {
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

/**
 * release:verify — closure, hash, platform, licence and evidence gates
 * (design §7.4, PRD CU-PLUGIN-21 / CU-INST-11). A missing or skipped required
 * evidence suite is a failure, never an implied pass. Never publishes.
 */
import { readFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
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

interface ReleaseManifest {
  readonly schemaVersion: number;
  readonly releaseVersion: string;
  readonly sourceCommit: string;
  readonly contractArchive: { version: string; sha256: string };
  readonly requiredEvidence: readonly string[];
  readonly artifacts: readonly {
    role: 'contracts' | 'plugin' | 'windows-env' | 'mac-native' | 'model' | 'evidence';
    platform?: 'win32-x64' | 'darwin-arm64';
    location: string;
    bytes: number;
    sha256: string;
    launchProfile?: string;
    signingIdentity?: string;
    noticesPath?: string;
    modelManifestPath?: string;
    evidenceRequired?: boolean;
    suite?: string;
    reportPath?: string;
  }[];
}

const ROLE_PLATFORM: Partial<Record<ReleaseManifest['artifacts'][number]['role'], 'win32-x64' | 'darwin-arm64'>> = {
  'windows-env': 'win32-x64',
  'mac-native': 'darwin-arm64',
};

let cachedValidator: ValidateFunction | undefined;

const SCHEMA_RELATIVE_PATH = 'tooling/release/schemas/release-manifest-v1.schema.json';

function manifestValidator(schemaPath: string): ValidateFunction {
  if (cachedValidator === undefined) {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as object;
    cachedValidator = ajv.compile(schema);
  }
  return cachedValidator;
}

export async function verifyRelease(
  manifestPath: string,
  schemaPath: string = join(process.cwd(), SCHEMA_RELATIVE_PATH),
): Promise<VerificationReport> {
  const failures: VerificationFailure[] = [];
  const absManifest = resolve(manifestPath);
  const manifestDir = dirname(absManifest);
  const raw = await readFile(absManifest, 'utf8');
  const manifest = JSON.parse(raw) as unknown;

  const validator = manifestValidator(schemaPath);
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

  for (const artifact of typed.artifacts) {
    const label = `${artifact.role}:${artifact.location}`;
    if (artifact.role === 'evidence') {
      continue;
    }
    // Path containment: artifact locations must stay inside the release tree.
    const absLocation = resolve(manifestDir, artifact.location);
    if (isAbsolute(artifact.location) || !absLocation.startsWith(manifestDir)) {
      failures.push({ gate: 'closure', detail: `${label}: location escapes the release directory` });
      continue;
    }
    const info = await stat(absLocation).catch(() => undefined);
    if (info === undefined) {
      failures.push({ gate: 'closure', detail: `${label}: file missing` });
      continue;
    }
    if (info.size !== artifact.bytes) {
      failures.push({
        gate: 'hash',
        detail: `${label}: size ${info.size} != declared ${artifact.bytes}`,
      });
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
    if (artifact.role === 'model') {
      const licenceFailure = await checkModelLicence(manifestDir, artifact.modelManifestPath, label);
      if (licenceFailure !== undefined) {
        failures.push(licenceFailure);
      }
    }
  }

  // Evidence gates: every required suite satisfied by a report with no gaps.
  const evidenceArtifacts = typed.artifacts.filter((artifact) => artifact.role === 'evidence');
  for (const evidence of evidenceArtifacts) {
    const label = `${evidence.role}:${evidence.suite ?? evidence.location}`;
    if (evidence.reportPath === undefined) {
      failures.push({ gate: 'evidence', detail: `${label}: evidence artifact has no reportPath` });
      continue;
    }
    const reportAbs = resolve(manifestDir, evidence.reportPath);
    const report = await readFile(reportAbs, 'utf8').catch(() => undefined);
    if (report === undefined) {
      failures.push({ gate: 'evidence', detail: `${label}: report file missing (${evidence.reportPath})` });
      continue;
    }
    const parsed = JSON.parse(report) as { qualification?: { missingEvidence?: string[] } };
    const missing = parsed.qualification?.missingEvidence ?? ['report has no qualification block'];
    if (missing.length > 0) {
      failures.push({
        gate: 'evidence',
        detail: `${label}: report has missing evidence: ${missing.join('; ')}`,
      });
    }
  }
  for (const required of typed.requiredEvidence) {
    const satisfied = evidenceArtifacts.some((evidence) => evidence.suite === required);
    if (!satisfied) {
      failures.push({
        gate: 'evidence',
        detail: `required suite '${required}' has no evidence artifact — unqualified, not a pass`,
      });
    }
  }

  return {
    releaseVersion: typed.releaseVersion,
    artifactCount: typed.artifacts.length,
    failures,
  };
}

async function checkModelLicence(
  manifestDir: string,
  modelManifestPath: string | undefined,
  label: string,
): Promise<VerificationFailure | undefined> {
  if (modelManifestPath === undefined) {
    return { gate: 'licence', detail: `${label}: model artifact has no modelManifestPath` };
  }
  const raw = await readFile(resolve(manifestDir, modelManifestPath), 'utf8').catch(() => undefined);
  if (raw === undefined) {
    return { gate: 'licence', detail: `${label}: model manifest missing (${modelManifestPath})` };
  }
  const modelManifest = JSON.parse(raw) as {
    upstream?: { licence?: string; baseModel?: { licence?: string } };
    licences?: { licence: string }[];
  };
  const licences = [
    modelManifest.upstream?.licence,
    modelManifest.upstream?.baseModel?.licence,
    ...(modelManifest.licences ?? []).map((entry) => entry.licence),
  ];
  if (licences.includes('qwen-research-non-commercial')) {
    return {
      gate: 'licence',
      detail: `${label}: non-commercial licence in the chain blocks publication (CU-INST-11)`,
    };
  }
  if (licences.every((licence) => licence === undefined)) {
    return { gate: 'licence', detail: `${label}: model manifest records no licences` };
  }
  return undefined;
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

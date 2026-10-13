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
import { isSatisfiableSemverRange, isValidSemverRange, minSatisfyingMajor } from './semver.js';
import { mandatorySuitesForRoles } from './suites.js';

export interface VerificationFailure {
  readonly gate: string;
  readonly detail: string;
}

export interface VerificationReport {
  readonly releaseVersion: string;
  readonly artifactCount: number;
  readonly failures: readonly VerificationFailure[];
  /** N02: candidate tooling validation vs publication eligibility.
   * `candidate` success is explicitly NOT qualification. */
  readonly qualification: 'candidate' | 'qualified';
}

interface Artifact {
  role: 'contracts' | 'plugin' | 'windows-env' | 'mac-native' | 'model' | 'evidence';
  platform?: 'win32-x64' | 'darwin-arm64';
  location: string;
  bytes: number;
  sha256: string;
  launchProfile?: string;
  launchProfileBytes?: number;
  launchProfileSha256?: string;
  signingIdentity?: string;
  qualification?: 'candidate' | 'qualified' | 'spike';
  noticesPath?: string;
  noticesBytes?: number;
  noticesSha256?: string;
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

// B07: supported consumer identities. Unknown adapter/runtime IDs fail;
// presence alone never establishes compatibility.
const SUPPORTED_ADAPTER_IDS = new Set([
  'gui-actor-onnx',
  'test',
  'test-pointer-only',
  'synthetic-test-adapter',
]);
const SUPPORTED_RUNTIME_IDS = new Set([
  'grounding-onnxruntime',
  'grounding-model-gui-actor-2b-fp16',
  'grounding-model-gui-actor-2b-int4',
]);

/** N03: structural semver range check via the real parser (rejects `1..2`,
 * accepts hyphen ranges like `1.0.0 - 2.0.0` and prereleases). */
function isSupportedSemverRange(range: string): boolean {
  return isValidSemverRange(range) && isSatisfiableSemverRange(range);
}

let cachedValidator: ValidateFunction | undefined;
let cachedModelValidator: ValidateFunction | undefined;
const cachedEvidenceValidators = new Map<string, ValidateFunction | undefined>();
const cachedProfileValidators = new Map<string, ValidateFunction | undefined>();

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

const EVIDENCE_SCHEMA_BY_SUITE: Record<string, string> = {
  parity: 'evidence/eval-report-v1.schema.json',
  'windows-native': 'evidence/native-report-v1.schema.json',
  'mac-native': 'evidence/native-report-v1.schema.json',
  'contract-conformance': 'evidence/contract-report-v1.schema.json',
  'host-consumer': 'evidence/host-report-v1.schema.json',
  'hub-ingest': 'evidence/hub-report-v1.schema.json',
};

/** E01: canonical per-suite report schemas (not only handwritten checks). */
function evidenceValidator(contractsDir: string, suite: string): ValidateFunction | undefined {
  const rel = EVIDENCE_SCHEMA_BY_SUITE[suite];
  if (rel === undefined) {
    return undefined;
  }
  const key = `${contractsDir}::${suite}`;
  if (!cachedEvidenceValidators.has(key)) {
    try {
      const ajv = new Ajv2020({ allErrors: true, strict: false });
      const core = JSON.parse(readFileSync(join(contractsDir, 'evidence', 'report-core-v1.schema.json'), 'utf8')) as object;
      ajv.addSchema(core);
      const schema = JSON.parse(readFileSync(join(contractsDir, rel), 'utf8')) as object;
      cachedEvidenceValidators.set(key, ajv.compile(schema));
    } catch {
      cachedEvidenceValidators.set(key, undefined);
    }
  }
  return cachedEvidenceValidators.get(key);
}

/** E01/E05: canonical launch-profile schemas by target. */
function launchProfileValidator(contractsDir: string, mac: boolean): ValidateFunction | undefined {
  const key = `${contractsDir}::${mac ? 'mac' : 'windows'}`;
  if (!cachedProfileValidators.has(key)) {
    try {
      const ajv = new Ajv2020({ allErrors: true, strict: false });
      const schema = JSON.parse(
        readFileSync(join(contractsDir, 'launch', mac ? 'mac-profile-v1.schema.json' : 'windows-profile-v1.schema.json'), 'utf8'),
      ) as object;
      cachedProfileValidators.set(key, ajv.compile(schema));
    } catch {
      cachedProfileValidators.set(key, undefined);
    }
  }
  return cachedProfileValidators.get(key);
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
  // Review trap fix: lock reads default to process.cwd() (the CLI runs with
  // cwd = repo root), but library callers verifying a manifest from another
  // cwd must pass repoRoot explicitly or candidate/qualified silently shifts.
  options?: { repoRoot?: string },
): Promise<VerificationReport> {
  const failures: VerificationFailure[] = [];
  const absManifest = resolve(manifestPath);
  const manifestDir = dirname(absManifest);
  const repoRoot = options?.repoRoot ?? process.cwd();
  const raw = await readFile(absManifest, 'utf8');
  const manifest = JSON.parse(raw) as unknown;

  const validator = releaseValidator(schemaPath);
  if (!validator(manifest)) {
    return {
      releaseVersion: '(unparsed)',
      artifactCount: 0,
      qualification: 'candidate',
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
    const absolute = resolve(repoRoot, lockPath);
    const actual = await sha256File(absolute).catch(() => undefined);
    if (actual === undefined) {
      failures.push({ gate: 'compatibility', detail: `lockDigests references missing file: ${lockPath}` });
    } else if (actual !== digest) {
      failures.push({ gate: 'compatibility', detail: `lock digest mismatch for ${lockPath}` });
    }
  }
  // E07: required pins cannot be omitted when backend/model artifacts ship;
  // B07: require the exact lock set for each shipped role — a substituted
  // package-lock.json cannot stand in for backend/model pins.
  const hasWindows = typed.artifacts.some((a) => a.role === 'windows-env');
  const hasMac = typed.artifacts.some((a) => a.role === 'mac-native');
  const hasModel = typed.artifacts.some((a) => a.role === 'model');
  const lockKeys = new Set(Object.keys(typed.lockDigests ?? {}));
  if (hasWindows) {
    for (const required of ['adapters/windows/upstream.lock', 'adapters/windows/uv.lock']) {
      if (!lockKeys.has(required)) {
        failures.push({ gate: 'compatibility', detail: `release ships windows-env but omits required pin ${required}` });
      }
    }
  }
  if (hasMac) {
    if (!lockKeys.has('adapters/macos/ghost-os/upstream.lock')) {
      failures.push({ gate: 'compatibility', detail: 'release ships mac-native but omits required pin adapters/macos/ghost-os/upstream.lock' });
    }
  }
  if (hasModel) {
    if (!lockKeys.has('grounding/models.lock.json')) {
      failures.push({ gate: 'compatibility', detail: 'release ships a model artifact but omits required pin grounding/models.lock.json' });
    }
  }
  const hasBackendOrModel = hasWindows || hasMac || hasModel;
  if (hasBackendOrModel && (typed.lockDigests === undefined || Object.keys(typed.lockDigests).length === 0)) {
    failures.push({ gate: 'compatibility', detail: 'release ships backend/model artifacts but omits required lockDigests identities' });
  }
  // E03: pin contents. A lock that claims `pinned`/`approved` status must
  // carry a full-SHA revision and matching dependency digests — a null or
  // floating revision behind a production claim fails closed. Unpinned or
  // unfetched locks stay candidate-only via deriveQualification (E01).
  for (const [upstreamRel, uvRel] of [
    ['adapters/windows/upstream.lock', 'adapters/windows/uv.lock'],
    ['adapters/macos/ghost-os/upstream.lock', undefined],
  ] as const) {
    if (!lockKeys.has(upstreamRel)) {
      continue;
    }
    try {
      const lockRaw = await readFile(resolve(repoRoot, upstreamRel), 'utf8');
      const lock = JSON.parse(lockRaw) as { status?: unknown; selectedRevision?: unknown; dependencyLockSha256?: unknown; sourceSha256?: unknown };
      if (lock.status === 'pinned') {
        if (typeof lock.selectedRevision !== 'string' || !/^[0-9a-f]{40}$/i.test(lock.selectedRevision)) {
          failures.push({ gate: 'compatibility', detail: `${upstreamRel} claims pinned status without a full-SHA selectedRevision — floating pin refused` });
        }
        if (typeof lock.sourceSha256 !== 'string' || lock.sourceSha256.length === 0) {
          failures.push({ gate: 'compatibility', detail: `${upstreamRel} claims pinned status without sourceSha256 provenance` });
        }
        if (uvRel !== undefined) {
          if (typeof lock.dependencyLockSha256 !== 'string' || lock.dependencyLockSha256 !== typed.lockDigests?.[uvRel]) {
            failures.push({ gate: 'compatibility', detail: `${upstreamRel} dependencyLockSha256 does not match the hashed ${uvRel} bytes — pins diverge from delivered content` });
          }
        }
      } else if (typeof lock.selectedRevision === 'string' && lock.selectedRevision.length > 0 && !/^[0-9a-f]{40}$/i.test(lock.selectedRevision)) {
        failures.push({ gate: 'compatibility', detail: `${upstreamRel} selectedRevision '${lock.selectedRevision}' is not a full commit SHA — floating pin refused` });
      }
    } catch {
      /* missing/unreadable locks already reported by the digest loop */
    }
  }
  // E03: an approved model lock must pin immutable revisions with complete
  // file hashes — an approved claim over null revisions fails closed.
  if (hasModel && lockKeys.has('grounding/models.lock.json')) {
    try {
      const modelsRaw = await readFile(resolve(repoRoot, 'grounding/models.lock.json'), 'utf8');
      const modelsLock = JSON.parse(modelsRaw) as {
        status?: unknown;
        models?: readonly { modelId?: unknown; revision?: unknown; weightsFiles?: readonly { path?: unknown; sha256?: unknown; bytes?: unknown }[] | null }[];
      };
      if (modelsLock.status === 'approved') {
        for (const model of modelsLock.models ?? []) {
          const id = typeof model.modelId === 'string' ? model.modelId : '(unknown model)';
          if (typeof model.revision !== 'string' || !(/^v?\d+\.\d+\.\d+(-[A-Za-z0-9.-]+)?$/.test(model.revision) || /^[0-9a-f]{40}$/i.test(model.revision))) {
            failures.push({ gate: 'compatibility', detail: `grounding/models.lock.json model '${id}' has no immutable revision — floating pin refused` });
          }
          for (const file of model.weightsFiles ?? []) {
            if (typeof file?.path !== 'string' || typeof file?.sha256 !== 'string' || typeof file?.bytes !== 'number') {
              failures.push({ gate: 'compatibility', detail: `grounding/models.lock.json model '${id}' has incomplete weight file hashes` });
              break;
            }
          }
        }
      }
    } catch {
      /* missing/unreadable locks already reported by the digest loop */
    }
  }
  // N03: supported host-tuple anchor. No pinned host-consumer build records
  // exist yet (T09); until they do, a host range whose minimum satisfiable
  // major exceeds the shipped plugin's own major claims an unsupported host
  // (e.g. `>=999.0.0` for plugin 0.1.0). Best-effort: skipped when the
  // plugin manifest is unreadable.
  let pluginMajor: number | undefined;
  try {
    const pluginRaw = await readFile(join(dirname(contractsDir), 'plugin', 'manifest.json'), 'utf8');
    const pluginVersion = (JSON.parse(pluginRaw) as { version?: unknown }).version;
    if (typeof pluginVersion === 'string') {
      const m = pluginVersion.match(/^(\d+)\./);
      if (m !== null) {
        pluginMajor = Number(m[1]);
      }
    }
  } catch {
    /* anchor skipped; structural range checks still apply */
  }
  if (!/^[0-9a-f]{7,40}(-dirty)?$/i.test(typed.sourceCommit)) {
    failures.push({ gate: 'compatibility', detail: `sourceCommit '${typed.sourceCommit}' is not a commit-shaped identity` });
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
      const reportFailures = validateEvidenceReport(report, label, artifact.suite, contractsDir);
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
    // N05: backend artifacts require a launch profile — a missing
    // applicable profile fails instead of passing silently.
    if ((artifact.role === 'windows-env' || artifact.role === 'mac-native') && artifact.launchProfile === undefined) {
      failures.push({ gate: 'closure', detail: `${label}: backend artifact requires a launchProfile` });
    }
    // B08: strict launch-profile validation. Must be a JSON object with
    // version, a stdio transport or argv/argvTemplate, an executable target
    // identifying the managed backend entrypoint, and unbuffered transport
    // (-u or PYTHONUNBUFFERED) so persistent sessions flush (B01).
    if (artifact.launchProfile !== undefined) {
      const lpAbs = resolve(manifestDir, artifact.launchProfile);
      const lpStat = await stat(lpAbs).catch(() => undefined);
      if (lpStat === undefined) {
        // Missing already reported above; skip further checks.
      } else {
        // N05: profile bytes are hash-bound — any byte change without a
        // manifest update fails the digest gate.
        if (artifact.launchProfileBytes === undefined || artifact.launchProfileSha256 === undefined) {
          failures.push({ gate: 'closure', detail: `${label}: launchProfile lacks bound launchProfileBytes/launchProfileSha256 digests` });
        } else {
          if (lpStat.size !== artifact.launchProfileBytes) {
            failures.push({ gate: 'hash', detail: `${label}: launchProfile size ${lpStat.size} != declared ${artifact.launchProfileBytes}` });
          }
          const lpActual = await sha256File(lpAbs).catch(() => undefined);
          if (lpActual !== undefined && lpActual !== artifact.launchProfileSha256) {
            failures.push({ gate: 'hash', detail: `${label}: launchProfile sha256 mismatch — profile bytes diverge from the release` });
          }
        }
        const lpRaw = await readFile(lpAbs, 'utf8').catch(() => undefined);
        if (lpRaw !== undefined) {
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
              failures.push(...validateLaunchProfile(parsed as Record<string, unknown>, label, contractsDir));
            }
          }
        }
      }
    }
    // E04: backend artifacts are verified by content. A windows-env
    // artifact must be a package record; a mac-native artifact must be a
    // package record or a Mach-O/fat helper. Anything else (e.g. a hashed
    // text blob standing in for an environment) satisfies the role only
    // as an explicitly spike-marked artifact — never silently.
    if (artifact.role === 'windows-env' || artifact.role === 'mac-native') {
      const looksLikePackage = await isPackageShaped(resolve(manifestDir, artifact.location));
      if (looksLikePackage || artifact.location.endsWith('package-manifest.json')) {
        failures.push(...(await verifyPackageClosure(manifestDir, artifact.location, label)));
      } else if (artifact.role === 'windows-env') {
        if (artifact.qualification !== 'spike') {
          failures.push({ gate: 'closure', detail: `${label}: windows-env artifact is not a verified package record — mark it explicitly spike or ship a package closure` });
        }
      } else {
        const helperBytes = await readFile(resolve(manifestDir, artifact.location)).catch(() => undefined);
        const helperMachO =
          helperBytes !== undefined &&
          helperBytes.length >= 4 &&
          ((helperBytes[0] === 0xcf && helperBytes[1] === 0xfa && helperBytes[2] === 0xed && helperBytes[3] === 0xfe) ||
            (helperBytes[0] === 0xfe && helperBytes[1] === 0xed && helperBytes[2] === 0xfa && helperBytes[3] === 0xcf) ||
            (helperBytes[0] === 0xca && helperBytes[1] === 0xfe && helperBytes[2] === 0xba && helperBytes[3] === 0xbe));
        if (!helperMachO && artifact.qualification !== 'spike') {
          failures.push({ gate: 'closure', detail: `${label}: mac-native artifact is neither a package record nor a Mach-O helper — mark it explicitly spike or ship a verified helper` });
        }
        // E04: files sitting beside a helper binary belong to the closure
        // too — verify a sibling package record when the helper ships in
        // its own package directory.
        if (helperMachO && artifact.location.includes('/')) {
          const siblingRel = `${artifact.location.split('/').slice(0, -1).join('/')}/package-manifest.json`;
          if (await stat(resolve(manifestDir, siblingRel)).catch(() => undefined)) {
            failures.push(...(await verifyPackageClosure(manifestDir, siblingRel, label)));
          }
        }
      }
    }
    // N02/N12: native format/arch/permissions/signing for mac-native.
    // Explicit per-artifact qualification wins; otherwise a placeholder
    // signing identity is treated as candidate-only (never qualified).
    // Qualified identities require Mach-O, executable mode, arm64 arch and
    // platform signature/notarization verification on macOS.
    if (artifact.role === 'mac-native') {
      const nativeAbs = resolve(manifestDir, artifact.location);
      const nativeBytes = await readFile(nativeAbs).catch(() => undefined);
      const nativeStat = await stat(nativeAbs).catch(() => undefined);
      const identity = artifact.signingIdentity ?? '';
      const isCandidate =
        artifact.qualification !== undefined
          ? artifact.qualification !== 'qualified'
          : /PENDING|PLACEHOLDER|SPIKE|TEST|EXAMPLE/i.test(identity);
      if (nativeBytes !== undefined) {
        const isMachO =
          nativeBytes.length >= 4 &&
          ((nativeBytes[0] === 0xcf && nativeBytes[1] === 0xfa && nativeBytes[2] === 0xed && nativeBytes[3] === 0xfe) ||
            (nativeBytes[0] === 0xfe && nativeBytes[1] === 0xed && nativeBytes[2] === 0xfa && nativeBytes[3] === 0xcf) ||
            (nativeBytes[0] === 0xca && nativeBytes[1] === 0xfe && nativeBytes[2] === 0xba && nativeBytes[3] === 0xbe));
        if (!isCandidate) {
          if (!isMachO) {
            failures.push({ gate: 'platform', detail: `${label}: mac-native helper is not a Mach-O binary (qualified helper requires native format)` });
          } else {
            // Arch check: thin 64-bit Mach-O header cputype at offset 4
            // (LE); fat binaries get per-slice inspection below. ARM64
            // cputype is 16777228 (0x0100000C).
            const isFat = nativeBytes[0] === 0xca && nativeBytes[1] === 0xfe;
            if (!isFat && nativeBytes.length >= 8) {
              const cputype = (nativeBytes[4] ?? 0) | ((nativeBytes[5] ?? 0) << 8) | ((nativeBytes[6] ?? 0) << 16) | ((nativeBytes[7] ?? 0) << 24);
              // ARM64 cputype is 16777228 (0x0100000C).
              if (cputype !== 16777228) {
                failures.push({ gate: 'platform', detail: `${label}: mac-native helper cputype ${cputype} is not Apple Silicon (arm64) — Intel-only binaries are unqualified` });
              }
            } else if (isFat) {
              failures.push(...checkFatSlices(nativeBytes, label));
            }
          }
          // Executable mode is checkable on every platform.
          if (nativeStat !== undefined && (nativeStat.mode & 0o111) === 0) {
            failures.push({ gate: 'platform', detail: `${label}: qualified mac-native helper lacks executable mode` });
          }
          // Signature/notarization require a macOS runner with codesign;
          // on other platforms report unqualified explicitly.
          if (process.platform !== 'darwin') {
            failures.push({ gate: 'platform', detail: `${label}: qualified mac-native signature/notarization requires a macOS runner — unqualified on ${process.platform}` });
          } else {
            failures.push(...(await verifyMacSignature(nativeAbs, identity, label)));
          }
        } else {
          // Candidate: still require a non-empty file (placeholder text ok).
          // Candidate success is explicitly not qualification.
          if (nativeBytes.length === 0) {
            failures.push({ gate: 'platform', detail: `${label}: mac-native candidate helper is empty` });
          }
        }
      }
    }
    // Referenced closure paths must exist, stay contained and — for
    // notices — match their bound digests (N05: notice bytes cannot drift
    // without invalidating the release).
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
    if (artifact.noticesPath !== undefined) {
      const noticeAbs = resolve(manifestDir, artifact.noticesPath);
      const noticeStat = await stat(noticeAbs).catch(() => undefined);
      if (noticeStat !== undefined) {
        if (artifact.noticesBytes === undefined || artifact.noticesSha256 === undefined) {
          failures.push({ gate: 'closure', detail: `${label}: noticesPath lacks bound noticesBytes/noticesSha256 digests` });
        } else {
          if (noticeStat.size !== artifact.noticesBytes) {
            failures.push({ gate: 'hash', detail: `${label}: notices size ${noticeStat.size} != declared ${artifact.noticesBytes}` });
          }
          const noticeActual = await sha256File(noticeAbs).catch(() => undefined);
          if (noticeActual !== undefined && noticeActual !== artifact.noticesSha256) {
            failures.push({ gate: 'hash', detail: `${label}: notices sha256 mismatch — notice bytes diverge from the release` });
          }
        }
      }
    }
    // B07: compatibility tuples validated against the supported consumer
    // matrix. Ranges must parse as semver; adapter/runtime IDs must be in
    // the approved allowlists. Presence alone is not compatibility.
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
      if (compat.hostAppRange !== undefined) {
        if (!hasHost || !isSupportedSemverRange(compat.hostAppRange)) {
          failures.push({
            gate: 'compatibility',
            detail: `${label}: compatibleWith.hostAppRange '${compat.hostAppRange}' is not a supported semver range`,
          });
        } else if (pluginMajor !== undefined) {
          // N03: the range must admit a host the project actually supports.
          const minMajor = minSatisfyingMajor(compat.hostAppRange);
          if (minMajor === undefined || minMajor > pluginMajor) {
            failures.push({
              gate: 'compatibility',
              detail: `${label}: compatibleWith.hostAppRange '${compat.hostAppRange}' admits no pinned consumer build (minimum major ${minMajor ?? 'none'} vs plugin major ${pluginMajor}) — unsupported tuple`,
            });
          }
        }
      } else if (artifact.role !== 'model') {
        // Backend/plugin roles must declare the host range they support.
        failures.push({
          gate: 'compatibility',
          detail: `${label}: compatibleWith.hostAppRange is required for role ${artifact.role}`,
        });
      }
      if (compat.adapterId !== undefined && !SUPPORTED_ADAPTER_IDS.has(compat.adapterId)) {
        failures.push({
          gate: 'compatibility',
          detail: `${label}: compatibleWith.adapterId '${compat.adapterId}' is not a supported adapter identity`,
        });
      }
      if (compat.runtimeId !== undefined && !SUPPORTED_RUNTIME_IDS.has(compat.runtimeId)) {
        failures.push({
          gate: 'compatibility',
          detail: `${label}: compatibleWith.runtimeId '${compat.runtimeId}' is not a supported runtime identity`,
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
      // B08: the manifest actually consumed (modelManifestPath) must be the
      // exact hashed bytes (location) — an alternate unhashed manifest with
      // a different revision must fail even when the original hash is kept.
      if (artifact.modelManifestPath !== artifact.location) {
        const [realManifest, realLocation] = await Promise.all([
          realpath(resolve(manifestDir, artifact.modelManifestPath)).catch(() => undefined),
          realpath(resolve(manifestDir, artifact.location)).catch(() => undefined),
        ]);
        if (realManifest === undefined || realLocation === undefined || realManifest !== realLocation) {
          failures.push({
            gate: 'hash',
            detail: `${label}: modelManifestPath (${artifact.modelManifestPath}) must identify the exact hashed manifest bytes (location ${artifact.location})`,
          });
          continue;
        }
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
      // E03: the manifest must carry its own identity fields — an omitted
      // runtime or adapter never satisfies a compatibility tuple.
      if (typeof model.runtimeId !== 'string' || model.runtimeId.length === 0) {
        failures.push({ gate: 'compatibility', detail: `${label}: model manifest lacks runtimeId identity` });
      }
      if (typeof model.identity?.adapterId !== 'string' || (model.identity.adapterId as string).length === 0) {
        failures.push({ gate: 'compatibility', detail: `${label}: model manifest lacks identity.adapterId` });
      }
      // N03: the outer compatibility tuple must agree with the delivered
      // model identity — a production manifest never ships as int4 with a
      // synthetic adapter.
      const manifestRuntime = model.runtimeId;
      const manifestAdapter = model.identity?.adapterId;
      const compatForModel = artifact.compatibleWith ?? {};
      if (typeof compatForModel.runtimeId === 'string' && typeof manifestRuntime === 'string' && compatForModel.runtimeId !== manifestRuntime) {
        failures.push({
          gate: 'compatibility',
          detail: `${label}: compatibleWith.runtimeId '${compatForModel.runtimeId}' disagrees with the delivered model manifest '${manifestRuntime}' — unsupported tuple`,
        });
      }
      if (typeof compatForModel.adapterId === 'string' && typeof manifestAdapter === 'string' && compatForModel.adapterId !== manifestAdapter) {
        failures.push({
          gate: 'compatibility',
          detail: `${label}: compatibleWith.adapterId '${compatForModel.adapterId}' disagrees with the delivered model manifest '${manifestAdapter}' — unsupported tuple`,
        });
      }
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
  failures.push(...(await verifyEvidenceBinding(manifestDir, typed.artifacts, evidenceArtifacts, typed.sourceCommit)));

  return {
    releaseVersion: typed.releaseVersion,
    artifactCount: typed.artifacts.length,
    qualification: await deriveQualification(manifestDir, typed, evidenceArtifacts, failures.length > 0, repoRoot),
    failures,
  };
}

/** Read a checkout lock best-effort (missing/unreadable → undefined). */
async function readCheckoutLock(repoRoot: string, rel: string): Promise<{ status?: unknown; selectedRevision?: unknown } | undefined> {
  try {
    return JSON.parse(await readFile(resolve(repoRoot, rel), 'utf8')) as { status?: unknown; selectedRevision?: unknown };
  } catch {
    return undefined;
  }
}

/**
 * E01: candidate vs qualified publication eligibility. `qualified` requires
 * ALL of: zero gate failures, pinned/approved checkout locks for every
 * shipped backend/model role, non-placeholder Mac identity, passed (not
 * candidate) parity on every model, producer-attested evidence, real
 * (non-zero) fixture hashes, verified package/helper backend closures, the
 * design §8.4 measurement fields, and a machine-readable consumer build on
 * every native/host/Hub report. Anything less is `candidate` — including a
 * hand-edited evidence set on unpinned locks.
 */
async function deriveQualification(
  manifestDir: string,
  typed: ReleaseManifest,
  evidenceArtifacts: readonly Artifact[],
  hasFailures: boolean,
  repoRoot: string,
): Promise<'candidate' | 'qualified'> {
  if (hasFailures) {
    return 'candidate';
  }
  const roles = new Set(typed.artifacts.map((a) => a.role));
  // Pinned checkout locks for every shipped backend/model role.
  if (roles.has('windows-env')) {
    const lock = await readCheckoutLock(repoRoot, 'adapters/windows/upstream.lock');
    if (lock?.status !== 'pinned' || typeof lock.selectedRevision !== 'string' || !/^[0-9a-f]{40}$/i.test(lock.selectedRevision)) {
      return 'candidate';
    }
  }
  if (roles.has('mac-native')) {
    const lock = await readCheckoutLock(repoRoot, 'adapters/macos/ghost-os/upstream.lock');
    if (lock?.status !== 'pinned' || typeof lock.selectedRevision !== 'string' || lock.selectedRevision.length === 0) {
      return 'candidate';
    }
  }
  if (roles.has('model')) {
    try {
      const modelsRaw = await readFile(resolve(repoRoot, 'grounding/models.lock.json'), 'utf8');
      if ((JSON.parse(modelsRaw) as { status?: unknown }).status !== 'approved') {
        return 'candidate';
      }
    } catch {
      return 'candidate';
    }
  }
  for (const artifact of typed.artifacts) {
    if (artifact.role === 'mac-native' && /PENDING|PLACEHOLDER|SPIKE|TEST|EXAMPLE/i.test(artifact.signingIdentity ?? '')) {
      return 'candidate';
    }
    if (artifact.qualification === 'spike' || artifact.qualification === 'candidate') {
      return 'candidate';
    }
    if (artifact.role === 'model' && artifact.modelManifestPath !== undefined) {
      const raw = await readFile(resolve(manifestDir, artifact.modelManifestPath), 'utf8').catch(() => undefined);
      if (raw !== undefined) {
        try {
          const status = (JSON.parse(raw) as { parityReport?: { status?: unknown } }).parityReport?.status;
          if (status !== 'passed') {
            return 'candidate';
          }
        } catch {
          return 'candidate';
        }
      }
    }
    // E01: backend artifacts must be verified package/helper closures —
    // spike payload blobs are never qualification material.
    if (artifact.role === 'windows-env') {
      if (!(await isPackageShaped(resolve(manifestDir, artifact.location)))) {
        return 'candidate';
      }
    }
    if (artifact.role === 'mac-native') {
      const bytes = await readFile(resolve(manifestDir, artifact.location)).catch(() => undefined);
      const machO =
        bytes !== undefined &&
        bytes.length >= 4 &&
        ((bytes[0] === 0xcf && bytes[1] === 0xfa && bytes[2] === 0xed && bytes[3] === 0xfe) ||
          (bytes[0] === 0xfe && bytes[1] === 0xed && bytes[2] === 0xfa && bytes[3] === 0xcf) ||
          (bytes[0] === 0xca && bytes[1] === 0xfe && bytes[2] === 0xba && bytes[3] === 0xbe));
      if (!machO) {
        return 'candidate';
      }
    }
  }
  for (const evidence of evidenceArtifacts) {
    const reportRel = evidence.reportPath ?? evidence.location;
    const raw = await readFile(resolve(manifestDir, reportRel), 'utf8').catch(() => undefined);
    if (raw === undefined) {
      continue;
    }
    try {
      const report = JSON.parse(raw) as {
        run?: { timestamp?: unknown; hardware?: unknown; consumerBuild?: unknown };
        aggregate?: { latency?: unknown };
        cases?: readonly { fixtureHash?: unknown }[];
        qualification?: { producerOnly?: unknown };
      };
      if (report.qualification?.producerOnly !== false) {
        return 'candidate';
      }
      // E01: zero fixture hashes are placeholders, not evidence.
      for (const c of report.cases ?? []) {
        if (typeof c?.fixtureHash !== 'string' || /^0+$/.test(c.fixtureHash)) {
          return 'candidate';
        }
      }
      // E01: design §8.4 measurement fields + consumer build identity.
      if (typeof report.run?.timestamp !== 'string' || report.run.timestamp.length === 0) {
        return 'candidate';
      }
      if (evidence.suite === 'windows-native' || evidence.suite === 'mac-native' || evidence.suite === 'parity') {
        if (typeof report.run?.hardware !== 'string' || report.run.hardware.length === 0) {
          return 'candidate';
        }
        if (typeof report.aggregate?.latency !== 'object' || report.aggregate.latency === null) {
          return 'candidate';
        }
        if (evidence.suite !== 'parity' && (typeof report.run?.consumerBuild !== 'string' || report.run.consumerBuild.length === 0)) {
          return 'candidate';
        }
      }
      if ((evidence.suite === 'host-consumer' || evidence.suite === 'hub-ingest') && (typeof report.run?.consumerBuild !== 'string' || report.run.consumerBuild.length === 0)) {
        return 'candidate';
      }
    } catch {
      return 'candidate';
    }
  }
  return 'qualified';
}

/**
 * Mandatory suites derived from artifact roles via the canonical registry
 * (B10) — independent of the caller-set requiredEvidence list.
 */
function deriveMandatorySuites(artifacts: readonly Artifact[]): readonly string[] {
  return mandatorySuitesForRoles(artifacts.map((a) => a.role));
}

/**
 * E04 binding: parity reports must reference the candidate model closure;
 * qualified (non-candidate) parity/native gates reject synthetic/recorded
 * producer-only scoring. Candidate placeholders (SPIKEPENDING, status
 * candidate) remain portable-pass; qualified claims require real evidence.
 * N02: EVERY model artifact needs its own digest-bound parity evidence
 * (not just the first), and every report's source commit, runner and
 * provider identities are bound to this release.
 */
async function verifyEvidenceBinding(
  manifestDir: string,
  allArtifacts: readonly Artifact[],
  evidenceArtifacts: readonly Artifact[],
  sourceCommit: string,
): Promise<readonly VerificationFailure[]> {
  const failures: VerificationFailure[] = [];
  const parityConfigIds = new Set<string>();
  const modelArtifacts = allArtifacts.filter((a) => a.role === 'model');
  for (const modelArtifact of modelArtifacts) {
    if (modelArtifact.modelManifestPath === undefined) {
      continue; // closure gate already reported
    }
    const manifestAbs = resolve(manifestDir, modelArtifact.modelManifestPath);
    const raw = await readFile(manifestAbs, 'utf8').catch(() => undefined);
    if (raw === undefined) {
      continue; // closure gate already reported
    }
    let model: ModelManifestShape;
    try {
      model = JSON.parse(raw) as ModelManifestShape;
    } catch {
      continue; // licence gate already reported
    }
    // N02: bind by digest — the parity evidence for THIS model is the
    // report whose bytes hash to its declared parity digest. A second
    // model without its own parity evidence fails even when the first
    // model's evidence is present and correct.
    let bound = false;
    for (const parityEvidence of evidenceArtifacts.filter((e) => e.suite === 'parity')) {
      const reportRel = parityEvidence.reportPath ?? parityEvidence.location;
      const reportAbs = resolve(manifestDir, reportRel);
      const reportHash = await sha256File(reportAbs).catch(() => undefined);
      if (reportHash === undefined || reportHash !== model.parityReport?.sha256) {
        continue;
      }
      bound = true;
      const reportRaw = await readFile(reportAbs, 'utf8').catch(() => undefined);
      if (reportRaw === undefined) {
        continue;
      }
      try {
        const report = JSON.parse(reportRaw) as {
          aggregate?: { executed?: number };
          configuration?: { modelConfigurationId?: string };
          run?: { runnerKind?: string };
          qualification?: { producerOnly?: boolean };
        };
        if (typeof report.configuration?.modelConfigurationId === 'string') {
          parityConfigIds.add(report.configuration.modelConfigurationId);
        }
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
    if (!bound) {
      failures.push({
        gate: 'evidence',
        detail: `model:${modelArtifact.location}: no parity evidence bound to this model's parity digest — each model needs its own report`,
      });
    }
  }
  // N02: every report's source commit is bound to this release — a report
  // produced for another SHA never gates this candidate.
  for (const evidence of evidenceArtifacts) {
    const reportRel = evidence.reportPath ?? evidence.location;
    const reportRaw = await readFile(resolve(manifestDir, reportRel), 'utf8').catch(() => undefined);
    if (reportRaw === undefined) {
      continue;
    }
    try {
      const report = JSON.parse(reportRaw) as { run?: { sourceCommit?: unknown } };
      const commit = report.run?.sourceCommit;
      if (typeof commit !== 'string' || commit.length === 0) {
        failures.push({
          gate: 'evidence',
          detail: `evidence:${evidence.location}: report lacks run.sourceCommit binding to this release`,
        });
      } else if (commit !== sourceCommit) {
        failures.push({
          gate: 'evidence',
          detail: `evidence:${evidence.location}: report sourceCommit '${commit}' does not match release sourceCommit '${sourceCommit}' — wrong evidence for this candidate`,
        });
      }
    } catch {
      /* JSON errors already reported */
    }
  }
  // E02: suite reports are bound to the exact artifacts they cover.
  // windows-native → its windows-env package digest; mac-native → its
  // helper digest; host-consumer/hub-ingest → the plugin digest they
  // accept. A report written for another package or host build never
  // gates this candidate.
  const digestSets: Record<string, Set<string>> = {
    'windows-native': new Set(allArtifacts.filter((a) => a.role === 'windows-env').map((a) => a.sha256)),
    'mac-native': new Set(allArtifacts.filter((a) => a.role === 'mac-native').map((a) => a.sha256)),
    'host-consumer': new Set(allArtifacts.filter((a) => a.role === 'plugin').map((a) => a.sha256)),
    'hub-ingest': new Set(allArtifacts.filter((a) => a.role === 'plugin').map((a) => a.sha256)),
  };
  const consumerBuilds = new Set<string>();
  for (const evidence of evidenceArtifacts) {
    if (digestSets[evidence.suite ?? ''] === undefined) {
      continue;
    }
    const reportRel = evidence.reportPath ?? evidence.location;
    const reportRaw = await readFile(resolve(manifestDir, reportRel), 'utf8').catch(() => undefined);
    if (reportRaw === undefined) {
      continue;
    }
    try {
      const report = JSON.parse(reportRaw) as { run?: { artifactDigest?: unknown; consumerBuild?: unknown } };
      const digest = report.run?.artifactDigest;
      if (typeof digest !== 'string' || digest.length === 0) {
        failures.push({
          gate: 'evidence',
          detail: `evidence:${evidence.location}: ${evidence.suite} report lacks run.artifactDigest binding to the covered artifact`,
        });
      } else if (!digestSets[evidence.suite as string]?.has(digest)) {
        failures.push({
          gate: 'evidence',
          detail: `evidence:${evidence.location}: run.artifactDigest ${digest.slice(0, 12)}… matches no shipped ${evidence.suite === 'mac-native' ? 'helper' : 'artifact'} digest — wrong evidence for this candidate`,
        });
      }
      // E02: consumer builds must agree — changing one report's host build
      // id without a matching report field breaks consensus and fails.
      const build = report.run?.consumerBuild;
      if (typeof build === 'string' && build.length > 0) {
        consumerBuilds.add(build);
      }
    } catch {
      /* JSON errors already reported */
    }
  }
  if (consumerBuilds.size > 1) {
    failures.push({
      gate: 'evidence',
      detail: `evidence reports disagree on consumer build (${[...consumerBuilds].join(' vs ')}) — reports cover different consumers`,
    });
  }
  // E02: native and parity reports must name measured hardware.
  for (const evidence of evidenceArtifacts) {
    if (evidence.suite !== 'windows-native' && evidence.suite !== 'mac-native' && evidence.suite !== 'parity') {
      continue;
    }
    const reportRel = evidence.reportPath ?? evidence.location;
    const reportRaw = await readFile(resolve(manifestDir, reportRel), 'utf8').catch(() => undefined);
    if (reportRaw === undefined) {
      continue;
    }
    try {
      const hardware = (JSON.parse(reportRaw) as { run?: { hardware?: unknown } }).run?.hardware;
      if (typeof hardware !== 'string' || hardware.length === 0) {
        failures.push({
          gate: 'evidence',
          detail: `evidence:${evidence.location}: report lacks run.hardware measured identity`,
        });
      }
    } catch {
      /* JSON errors already reported */
    }
  }
  // B06: native evidence must concern the same model configuration as the
  // parity evidence — unrelated source/configuration fails.
  if (parityConfigIds.size > 0) {
    for (const evidence of evidenceArtifacts) {
      if (evidence.suite !== 'windows-native' && evidence.suite !== 'mac-native') {
        continue;
      }
      const reportRel = evidence.reportPath ?? evidence.location;
      const reportRaw = await readFile(resolve(manifestDir, reportRel), 'utf8').catch(() => undefined);
      if (reportRaw === undefined) {
        continue;
      }
      try {
        const report = JSON.parse(reportRaw) as {
          configuration?: { modelConfigurationId?: unknown };
        };
        const nativeConfig = report.configuration?.modelConfigurationId;
        if (typeof nativeConfig !== 'string' || nativeConfig.length === 0) {
          failures.push({
            gate: 'evidence',
            detail: `evidence:${evidence.location}: native report lacks configuration.modelConfigurationId binding`,
          });
        } else if (!parityConfigIds.has(nativeConfig)) {
          failures.push({
            gate: 'evidence',
            detail: `evidence:${evidence.location}: configuration ${nativeConfig} matches no bound parity configuration (${[...parityConfigIds].join(', ')}) — wrong evidence for this candidate`,
          });
        }
      } catch {
        /* JSON errors already reported */
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
  runtimeId?: unknown;
  identity?: { adapterId?: unknown };
}

/**
 * E05: validate report types, required fields, per-case outcomes and
 * aggregate consistency before evaluating a gate. Returns structured
 * diagnostics; null/array/malformed reports fail instead of throwing.
 */
function validateEvidenceReport(
  report: unknown,
  label: string,
  suite: string | undefined,
  contractsDir?: string,
): readonly VerificationFailure[] {
  const failures: VerificationFailure[] = [];
  if (report === null || typeof report !== 'object' || Array.isArray(report)) {
    return [{ gate: 'evidence', detail: `${label}: report must be a JSON object (got ${Array.isArray(report) ? 'array' : String(report)})` }];
  }
  // E01: canonical per-suite schema first — structural conformance to the
  // contracts/ evidence schemas, not only handwritten field lists.
  if (suite !== undefined && contractsDir !== undefined) {
    const validate = evidenceValidator(contractsDir, suite);
    if (validate !== undefined && !validate(report)) {
      for (const e of (validate.errors ?? []).slice(0, 3)) {
        failures.push({ gate: 'evidence', detail: `${label}: report fails ${suite} schema: ${e.instancePath || '/'} ${e.message}` });
      }
    }
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
  // B05: all five counters are required. Missing counters previously
  // returned silently with no failure, letting empty evidence pass.
  // Review: keep collecting — counter-independent checks (identity, suite,
  // runner, provider) still run so one malformed report yields the full
  // diagnostic list, not just the first class.
  let countersComplete = true;
  for (const key of ['planned', 'executed', 'passed', 'failed', 'skipped'] as const) {
    const value = (aggregate as Record<string, unknown>)[key];
    if (!isInt(value) || (value as number) < 0) {
      failures.push({ gate: 'evidence', detail: `${label}: report aggregate.${key} must be a non-negative integer (got ${JSON.stringify(value)})` });
      countersComplete = false;
    }
  }
  const executed = aggregate.executed;
  const failed = aggregate.failed;
  const skipped = aggregate.skipped;
  const planned = aggregate.planned;
  const passed = aggregate.passed;
  const cases = (typed as { cases?: unknown }).cases;
  // Counter-dependent checks run only on complete counters; everything
  // below this block is counter-independent and always runs.
  if (countersComplete) {
    if (
      typeof executed !== 'number' ||
      typeof failed !== 'number' ||
      typeof skipped !== 'number' ||
      typeof planned !== 'number' ||
      typeof passed !== 'number'
    ) {
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
    // Aggregate arithmetic consistency (B05: all required, exact match).
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
    // Per-case list must exist and be non-empty when executed > 0; empty/missing
    // case lists fail. Failed case versus passing aggregate fails. B05:
    // recomputed per-case totals must match exactly; duplicates fail.
    if (!Array.isArray(cases) || cases.length === 0) {
      if (executed > 0) {
        failures.push({ gate: 'evidence', detail: `${label}: report has no per-case outcomes for ${executed} executed cases` });
      }
    } else {
      let casePassed = 0;
      let caseFailed = 0;
      let caseSkipped = 0;
      const seenIds = new Set<string>();
      let duplicateFound = false;
      for (const c of cases) {
        if (typeof c !== 'object' || c === null) {
          failures.push({ gate: 'evidence', detail: `${label}: report case must be an object` });
          break;
        }
        const status = (c as { status?: unknown }).status;
        const caseId = (c as { caseId?: unknown }).caseId;
        if (typeof caseId === 'string') {
          if (seenIds.has(caseId)) {
            duplicateFound = true;
          }
          seenIds.add(caseId);
        }
        if (status === 'fail' || status === 'failed') {
          caseFailed += 1;
        } else if (status === 'pass' || status === 'passed') {
          casePassed += 1;
        } else if (status === 'skipped') {
          caseSkipped += 1;
        } else {
          failures.push({ gate: 'evidence', detail: `${label}: report case has unknown status ${JSON.stringify(status)}` });
          break;
        }
      }
      if (duplicateFound) {
        failures.push({ gate: 'evidence', detail: `${label}: report contains duplicate caseId entries` });
      }
      // Reconcile per-case counts against the aggregate (B05 second repro:
      // a skipped case with aggregate skipped=0 must fail).
      if (caseFailed !== failed) {
        failures.push({ gate: 'evidence', detail: `${label}: report per-case failed ${caseFailed} != aggregate.failed ${failed}` });
      }
      if (caseSkipped !== skipped) {
        failures.push({ gate: 'evidence', detail: `${label}: report per-case skipped ${caseSkipped} != aggregate.skipped ${skipped}` });
      }
      if (casePassed !== passed) {
        failures.push({ gate: 'evidence', detail: `${label}: report per-case passed ${casePassed} != aggregate.passed ${passed}` });
      }
      if (cases.length !== executed && cases.length !== planned) {
        failures.push({ gate: 'evidence', detail: `${label}: report case count ${cases.length} != executed ${executed} (planned ${planned})` });
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
  // N01: report identity and provenance. Counters alone cannot satisfy a
  // suite — every report must carry its run/configuration identity and
  // every case must carry a real case ID plus fixture hash. A bare
  // `{status:'pass'}` row without consumer build, fixture, source or
  // configuration never gates a release.
  const run = (typed as { run?: unknown }).run;
  if (typeof run !== 'object' || run === null || Array.isArray(run)) {
    failures.push({ gate: 'evidence', detail: `${label}: report lacks run identity (mode/dataset/runner/provenance)` });
  } else {
    for (const key of ['mode', 'datasetId', 'datasetVersion', 'runnerKind'] as const) {
      const value = (run as Record<string, unknown>)[key];
      if (typeof value !== 'string' || value.length === 0) {
        failures.push({ gate: 'evidence', detail: `${label}: report run.${key} must be a non-empty string` });
      }
    }
  }
  const configuration = (typed as { configuration?: unknown }).configuration;
  if (typeof configuration !== 'object' || configuration === null || Array.isArray(configuration)) {
    failures.push({ gate: 'evidence', detail: `${label}: report lacks configuration identity (model/adapter/build)` });
  } else {
    for (const key of ['modelConfigurationId', 'adapterId'] as const) {
      const value = (configuration as Record<string, unknown>)[key];
      if (typeof value !== 'string' || value.length === 0) {
        failures.push({ gate: 'evidence', detail: `${label}: report configuration.${key} must be a non-empty string` });
      }
    }
  }
  // N01: per-case identity. caseId is required (missing/empty/non-string
  // fails — previously only string IDs were duplicate-checked), as is the
  // fixture hash binding the outcome to immutable evidence.
  if (Array.isArray(cases) && cases.length > 0) {
    for (const c of cases) {
      if (typeof c !== 'object' || c === null) {
        break; // already reported above
      }
      const caseId = (c as { caseId?: unknown }).caseId;
      if (typeof caseId !== 'string' || caseId.length === 0) {
        failures.push({ gate: 'evidence', detail: `${label}: report case lacks a non-empty string caseId` });
        break;
      }
      const fixtureHash = (c as { fixtureHash?: unknown }).fixtureHash;
      if (typeof fixtureHash !== 'string' || !/^[0-9a-f]{64}$/i.test(fixtureHash)) {
        failures.push({ gate: 'evidence', detail: `${label}: report case '${caseId}' lacks a 64-hex fixtureHash binding` });
        break;
      }
    }
  }
  // Suite binding: the report must concern this suite, not an unrelated one.
  // B05/B06: parity requires eval-report; native suites require
  // native-report. Unrelated schemas fail even for candidates.
  if (suite !== undefined) {
    const schema = typeof typed.schema === 'string' ? typed.schema : '';
    if (suite === 'parity' && schema !== 'computer-use-eval-report-v1') {
      failures.push({ gate: 'evidence', detail: `${label}: suite 'parity' requires a computer-use-eval-report-v1 report (got ${schema || '(none)'})` });
    }
    if ((suite === 'windows-native' || suite === 'mac-native') && schema !== 'computer-use-native-report-v1') {
      failures.push({ gate: 'evidence', detail: `${label}: suite '${suite}' requires a computer-use-native-report-v1 report (got ${schema || '(none)'})` });
    }
    if (suite === 'contract-conformance' && schema !== 'computer-use-contract-report-v1') {
      failures.push({ gate: 'evidence', detail: `${label}: suite 'contract-conformance' requires a computer-use-contract-report-v1 report (got ${schema || '(none)'})` });
    }
    if (suite === 'host-consumer' && schema !== 'computer-use-host-report-v1') {
      failures.push({ gate: 'evidence', detail: `${label}: suite 'host-consumer' requires a computer-use-host-report-v1 report (got ${schema || '(none)'})` });
    }
    if (suite === 'hub-ingest' && schema !== 'computer-use-hub-report-v1') {
      failures.push({ gate: 'evidence', detail: `${label}: suite 'hub-ingest' requires a computer-use-hub-report-v1 report (got ${schema || '(none)'})` });
    }
  }
  // N02: runner identity allowlists per suite. Unknown runner kinds fail
  // even for candidates — `not-a-native-runner` never gates a release.
  const runner = (typed as { run?: { runnerKind?: unknown } }).run?.runnerKind;
  const RUNNER_ALLOWLIST: Record<string, readonly string[]> = {
    parity: ['recorded', 'synthetic', 'reference', 'onnx', 'onnx-reference'],
    'windows-native': ['native-controlled'],
    'mac-native': ['native-controlled'],
    'contract-conformance': ['contract-check'],
    'host-consumer': ['host-suite'],
    'hub-ingest': ['hub-check'],
  };
  if (suite !== undefined && RUNNER_ALLOWLIST[suite] !== undefined) {
    if (typeof runner !== 'string' || runner.length === 0) {
      failures.push({ gate: 'evidence', detail: `${label}: report lacks run.runnerKind identity` });
    } else if (!RUNNER_ALLOWLIST[suite]!.includes(runner)) {
      if ((suite === 'windows-native' || suite === 'mac-native') && (runner === 'synthetic' || runner === 'recorded')) {
        failures.push({ gate: 'evidence', detail: `${label}: suite '${suite}' cannot be satisfied by ${runner} scoring — native-controlled evidence required` });
      } else {
        failures.push({ gate: 'evidence', detail: `${label}: suite '${suite}' runnerKind '${runner}' is not a known runner for this suite` });
      }
    }
  }
  // N02: provider identity. Every report names the hardware/effective
  // provider it measured; `unmeasured` never gates a release. Provisional
  // allowlist pending per-provider qualification (T04/T08).
  const provider = (typed as { run?: { provider?: unknown } }).run?.provider;
  const PROVIDER_ALLOWLIST = new Set(['cpu', 'dml', 'cuda', 'tensorrt', 'coreml', 'metal', 'host', 'contract', 'hub', 'native']);
  if (typeof provider !== 'string' || !PROVIDER_ALLOWLIST.has(provider)) {
    failures.push({ gate: 'evidence', detail: `${label}: report run.provider '${typeof provider === 'string' ? provider : '(missing)'}' is not a measured provider identity` });
  }
  return failures;
}

/** N05/N12: strict launch-profile validation with target-specific schemas.
 * Windows profiles must name the exact managed Python entrypoint, arguments,
 * working-directory policy and disabled telemetry — substring markers are
 * not executable validation. Mac profiles use the helper `mcp` schema and
 * never satisfy Windows Python requirements. Exported for unit tests. */
export function validateLaunchProfile(
  obj: Record<string, unknown>,
  label: string,
  contractsDir?: string,
): readonly VerificationFailure[] {
  const failures: VerificationFailure[] = [];
  const argvEarly = (obj.argv ?? obj.argvTemplate) as unknown;
  const mac = Array.isArray(argvEarly) && isMacLaunchArgv(argvEarly);
  // E01/E05: canonical launch schema first.
  if (contractsDir !== undefined) {
    const validate = launchProfileValidator(contractsDir, mac);
    if (validate !== undefined && !validate(obj)) {
      for (const e of (validate.errors ?? []).slice(0, 3)) {
        failures.push({ gate: 'closure', detail: `${label}: launchProfile fails ${mac ? 'mac' : 'windows'} schema: ${e.instancePath || '/'} ${e.message}` });
      }
    }
  }
  if (obj.version !== 1) {
    failures.push({ gate: 'closure', detail: `${label}: launchProfile version must be 1 (got ${JSON.stringify(obj.version)})` });
  }
  const argv = (obj.argv ?? obj.argvTemplate) as unknown;
  const transport = obj.transport as unknown;
  if (argv === undefined && transport !== 'stdio-jsonrpc') {
    failures.push({ gate: 'closure', detail: `${label}: launchProfile lacks argv/argvTemplate or stdio-jsonrpc transport` });
  }
  if (argv !== undefined) {
    if (!Array.isArray(argv)) {
      failures.push({ gate: 'closure', detail: `${label}: launchProfile argv must be an array` });
    } else if (isMacLaunchArgv(argv)) {
      failures.push(...validateMacLaunchProfile(argv, obj, label));
    } else {
      failures.push(...validateWindowsLaunchProfile(argv, obj, label));
    }
  } else if (transport === 'stdio-jsonrpc') {
    // Transport-only profiles carry no executable identity and cannot
    // launch a backend — they fail as applicable profiles (N05). Legacy
    // fixtures must carry the full argv form.
    failures.push({ gate: 'closure', detail: `${label}: launchProfile lacks argv/argvTemplate executable identity` });
  }
  if (obj.upstreamLockRequired !== undefined && obj.upstreamLockRequired !== 'pinned') {
    failures.push({ gate: 'closure', detail: `${label}: launchProfile upstreamLockRequired must be 'pinned'` });
  }
  return failures;
}

/** N12: true for Mac helper launch vectors (`<helper> mcp`). */
function isMacLaunchArgv(argv: unknown[]): boolean {
  return argv.includes('<helper>') || (argv.length === 2 && argv[1] === 'mcp');
}

/** N05: exact Windows managed-backend launch contract. */
function validateWindowsLaunchProfile(argv: unknown[], obj: Record<string, unknown>, label: string): readonly VerificationFailure[] {
  const failures: VerificationFailure[] = [];
  // E05: the reviewed executable is exactly `<managed-python>` — a local
  // `python`/`python.exe` path is not the pinned interpreter and never
  // launches the managed closure. Byte-level interpreter binding stays
  // T02 (no shipped interpreter digest exists yet).
  const matches =
    argv.length === 4 &&
    argv[0] === '<managed-python>' &&
    argv[1] === '-u' &&
    argv[2] === '-m' &&
    argv[3] === 'aifetchly_windows.entrypoint';
  if (!matches) {
    failures.push({
      gate: 'closure',
      detail: `${label}: launchProfile argv must be exactly [<managed-python> -u -m aifetchly_windows.entrypoint] (got ${JSON.stringify(argv).slice(0, 120)})`,
    });
  }
  if (obj.transport !== undefined && obj.transport !== 'stdio-jsonrpc') {
    failures.push({ gate: 'closure', detail: `${label}: launchProfile transport must be 'stdio-jsonrpc'` });
  }
  if (obj.cwd !== '<managed-env-root>') {
    failures.push({ gate: 'closure', detail: `${label}: launchProfile cwd must be '<managed-env-root>' (got ${JSON.stringify(obj.cwd)})` });
  }
  const envPolicy = obj.envPolicy as Record<string, unknown> | undefined;
  if (typeof envPolicy !== 'object' || envPolicy === null || Array.isArray(envPolicy)) {
    failures.push({ gate: 'closure', detail: `${label}: launchProfile envPolicy must be an object` });
  } else {
    if (envPolicy.telemetry !== 'disabled') {
      failures.push({ gate: 'closure', detail: `${label}: launchProfile envPolicy.telemetry must be 'disabled'` });
    }
    if (envPolicy.noGlobalPath !== true) {
      failures.push({ gate: 'closure', detail: `${label}: launchProfile envPolicy.noGlobalPath must be true` });
    }
    const extra = envPolicy.extra as Record<string, unknown> | undefined;
    if (extra?.PYTHONUNBUFFERED !== '1' && !argv.includes('-u')) {
      failures.push({ gate: 'closure', detail: `${label}: launchProfile must request unbuffered stdio (-u or PYTHONUNBUFFERED=1) for persistent sessions (B01)` });
    }
  }
  if (obj.stdoutPolicy !== undefined && obj.stdoutPolicy !== 'protocol-only') {
    failures.push({ gate: 'closure', detail: `${label}: launchProfile stdoutPolicy must be 'protocol-only'` });
  }
  return failures;
}

/** N12: exact Mac helper launch contract. */
function validateMacLaunchProfile(argv: unknown[], obj: Record<string, unknown>, label: string): readonly VerificationFailure[] {
  const failures: VerificationFailure[] = [];
  const helperOk =
    argv.length === 2 &&
    typeof argv[0] === 'string' &&
    (argv[0] === '<helper>' || /(^|[\\/])helper$/.test(argv[0] as string)) &&
    argv[1] === 'mcp';
  if (!helperOk) {
    failures.push({
      gate: 'closure',
      detail: `${label}: mac launchProfile argv must be exactly [<helper> mcp] (got ${JSON.stringify(argv).slice(0, 120)})`,
    });
  }
  if (obj.cwd !== '<managed-env-root>' && obj.cwd !== '<managed-macos-root>') {
    failures.push({ gate: 'closure', detail: `${label}: mac launchProfile cwd must be a managed root (got ${JSON.stringify(obj.cwd)})` });
  }
  const envPolicy = obj.envPolicy as Record<string, unknown> | undefined;
  // E05: telemetry disabled is required on Mac profiles too — an omitted
  // envPolicy no longer passes.
  if (typeof envPolicy !== 'object' || envPolicy === null || Array.isArray(envPolicy)) {
    failures.push({ gate: 'closure', detail: `${label}: mac launchProfile envPolicy must be an object` });
  } else if (envPolicy.telemetry !== 'disabled') {
    failures.push({ gate: 'closure', detail: `${label}: mac launchProfile envPolicy.telemetry must be 'disabled'` });
  }
  return failures;
}

/** N12: inspect fat-binary slices — at least one arm64 slice is required;
 * Intel-only universal binaries are unqualified. */
function checkFatSlices(nativeBytes: Buffer, label: string): readonly VerificationFailure[] {
  // fat_header: magic(4) nfat(4, BE). Each fat_arch: cputype(4,BE)
  // cpusubtype(4) offset(4,BE) size(4,BE) align(4,BE) — 20 bytes.
  if (nativeBytes.length < 8) {
    return [{ gate: 'platform', detail: `${label}: fat binary header truncated` }];
  }
  const nfat = (nativeBytes[4] as number) * 0x1000000 + (nativeBytes[5] as number) * 0x10000 + (nativeBytes[6] as number) * 0x100 + (nativeBytes[7] as number);
  if (nfat === 0 || nfat > 32) {
    return [{ gate: 'platform', detail: `${label}: fat binary slice count ${nfat} is not plausible` }];
  }
  if (8 + nfat * 20 > nativeBytes.length) {
    return [{ gate: 'platform', detail: `${label}: fat binary slice headers overrun the file` }];
  }
  const ARM64 = 16777228;
  let hasArm64 = false;
  for (let i = 0; i < nfat; i += 1) {
    const off = 8 + i * 20;
    const cputype =
      (nativeBytes[off] as number) * 0x1000000 + (nativeBytes[off + 1] as number) * 0x10000 + (nativeBytes[off + 2] as number) * 0x100 + (nativeBytes[off + 3] as number);
    // E08: slice bodies must lie inside the file — a header claiming an
    // out-of-file slice is malformed, not just Intel-only.
    const sliceOffset =
      (nativeBytes[off + 8] as number) * 0x1000000 + (nativeBytes[off + 9] as number) * 0x10000 + (nativeBytes[off + 10] as number) * 0x100 + (nativeBytes[off + 11] as number);
    const sliceSize =
      (nativeBytes[off + 12] as number) * 0x1000000 + (nativeBytes[off + 13] as number) * 0x10000 + (nativeBytes[off + 14] as number) * 0x100 + (nativeBytes[off + 15] as number);
    if (sliceOffset + sliceSize > nativeBytes.length) {
      return [{ gate: 'platform', detail: `${label}: fat binary slice ${i} body overruns the file` }];
    }
    if (cputype === ARM64) {
      hasArm64 = true;
    }
  }
  if (!hasArm64) {
    return [{ gate: 'platform', detail: `${label}: fat binary has no Apple Silicon (arm64) slice — Intel-only universals are unqualified` }];
  }
  return [];
}

/** E08: pure team-attribution check over `codesign -d` output. Exported
 * for unit tests — the codesign/spctl invocations themselves need macOS. */
export function checkSigningTeam(identity: string, teamOut: string, label: string): readonly VerificationFailure[] {
  // E08: the manifest must name an explicit team id — a bare identity
  // string with no (TEAMID) never satisfies team matching, so a
  // different team cannot slip through the comparison below.
  const expectedTeam = identity.match(/\(([A-Z0-9]{10})\)/);
  if (expectedTeam === null || expectedTeam[1] === undefined) {
    return [{ gate: 'platform', detail: `${label}: signing identity names no explicit (TEAMID) team id — team attribution unverifiable` }];
  }
  if (!/TeamIdentifier=/.test(teamOut)) {
    return [{ gate: 'platform', detail: `${label}: codesign output lacks TeamIdentifier — unsigned or ad-hoc signature` }];
  }
  if (!teamOut.includes(expectedTeam[1])) {
    return [{ gate: 'platform', detail: `${label}: signing team ${expectedTeam[1]} not found in codesign output` }];
  }
  return [];
}

/** N12: verify the actual extracted helper and its architecture/signing identity using target-specific metadata; integrate that format with assembly and bounded native verification commands. */
async function verifyMacSignature(
  helperAbs: string,
  identity: string,
  label: string,
): Promise<readonly VerificationFailure[]> {
  // Runs only on darwin (caller gates platform). Uses codesign + spctl when
  // available; missing tooling fails closed — an unverifiable signature is
  // not a verified one (B09). All invocations are time-bounded (N12) so a
  // hung verifier tool cannot hang release verification.
  const { spawnSync } = await import('node:child_process');
  const failures: VerificationFailure[] = [];
  if (identity.length === 0) {
    failures.push({ gate: 'platform', detail: `${label}: qualified mac-native requires a signing identity` });
    return failures;
  }
  try {
    const verify = spawnSync('codesign', ['--verify', '--deep', '--strict', helperAbs], { encoding: 'utf8', timeout: 30000 });
    if (verify.status !== 0) {
      failures.push({
        gate: 'platform',
        detail: `${label}: codesign verification failed for ${identity}: ${(verify.stderr || verify.stdout || '').slice(0, 300)}`,
      });
      return failures;
    }
    // N12: the display invocation must itself succeed — its TeamIdentifier
    // output is evidence only when the tool exits cleanly.
    const display = spawnSync('codesign', ['-d', '--verbose=2', helperAbs], { encoding: 'utf8', timeout: 30000 });
    if (display.status !== 0) {
      failures.push({
        gate: 'platform',
        detail: `${label}: codesign display failed: ${(display.stderr || display.stdout || '').slice(0, 300)}`,
      });
      return failures;
    }
    const teamOut = `${display.stderr || ''}\n${display.stdout || ''}`;
    failures.push(...checkSigningTeam(identity, teamOut, label));
    const assess = spawnSync('spctl', ['-a', '-t', 'exec', '-vv', helperAbs], { encoding: 'utf8', timeout: 30000 });
    if (assess.status !== 0) {
      failures.push({
        gate: 'platform',
        detail: `${label}: notarization assessment (spctl) failed: ${(assess.stderr || assess.stdout || '').slice(0, 300)}`,
      });
    }
  } catch (error) {
    failures.push({ gate: 'platform', detail: `${label}: macOS signature verification unavailable: ${(error as Error).message}` });
  }
  return failures;
}

/** N04: true when artifact bytes parse as a package record (content-based
 * gating — renamed manifests like `environment.json` cannot dodge checks). */
async function isPackageShaped(absPath: string): Promise<boolean> {
  const raw = await readFile(absPath, 'utf8').catch(() => undefined);
  if (raw === undefined) {
    return false;
  }
  try {
    const parsed = JSON.parse(raw) as { files?: unknown };
    return typeof parsed === 'object' && parsed !== null && 'files' in parsed;
  } catch {
    return false;
  }
}

/** List all files under a directory, relative with `/` separators. */
async function walkPackageFiles(root: string): Promise<string[]> {
  const { readdir } = await import('node:fs/promises');
  const out: string[] = [];
  async function walk(dir: string, prefix: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const rel = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) {
        await walk(join(dir, entry.name), rel);
      } else if (entry.isFile() || entry.isSymbolicLink()) {
        out.push(rel);
      }
    }
  }
  await walk(root, '');
  return out.sort();
}

async function verifyPackageClosure(
  manifestDir: string,
  packageManifestRel: string,
  label: string,
): Promise<readonly VerificationFailure[]> {
  const failures: VerificationFailure[] = [];
  const absManifest = resolve(manifestDir, packageManifestRel);
  const raw = await readFile(absManifest, 'utf8').catch(() => undefined);
  if (raw === undefined) {
    return failures; // missing already reported as the artifact itself
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [{ gate: 'closure', detail: `${label}: nested package-manifest is not valid JSON` }];
  }
  // N04: malformed roots (null, arrays, missing files) are structured
  // failures — never a thrown TypeError to callers of verifyRelease().
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return [{ gate: 'closure', detail: `${label}: nested package record must be a JSON object` }];
  }
  const files = (parsed as { files?: unknown }).files;
  if (!Array.isArray(files)) {
    return [{ gate: 'closure', detail: `${label}: nested package record lacks a files array` }];
  }
  if (files.length === 0) {
    return [{ gate: 'closure', detail: `${label}: nested package record declares an empty files closure` }];
  }
  // N04: package records live in their own package subdirectory (as
  // assembly emits `package/package-manifest.json`) so closure enumeration
  // is scoped — a root-level record cannot distinguish its files from
  // sibling release artifacts.
  if (!packageManifestRel.includes('/')) {
    return [{ gate: 'closure', detail: `${label}: package record must live in a package subdirectory, not the release root` }];
  }
  const packageDir = dirname(absManifest);
  const realPackageDir = await realpath(packageDir).catch(() => packageDir);
  const seen = new Set<string>();
  const declared = new Set<string>();
  for (const entry of files) {
    if (typeof entry !== 'object' || entry === null) {
      failures.push({ gate: 'closure', detail: `${label}: nested package entry must be an object` });
      continue;
    }
    const { path: rel, bytes, sha256 } = entry as { path?: unknown; bytes?: unknown; sha256?: unknown };
    if (typeof rel !== 'string' || typeof bytes !== 'number' || typeof sha256 !== 'string') {
      failures.push({ gate: 'closure', detail: `${label}: nested package entry lacks path/bytes/sha256` });
      continue;
    }
    // Package-manifest paths are relative to the package directory.
    // Split on both separators: `..\evil` escapes via resolve on a Windows
    // verifier even though it is one segment under a '/' split.
    if (isAbsolute(rel) || rel.split('/').includes('..') || rel.split('\\').includes('..')) {
      failures.push({ gate: 'closure', detail: `${label}: nested package path escapes: ${rel}` });
      continue;
    }
    if (seen.has(rel)) {
      failures.push({ gate: 'closure', detail: `${label}: nested package declares duplicate path: ${rel}` });
      continue;
    }
    seen.add(rel);
    declared.add(rel);
    const abs = resolve(packageDir, rel);
    // N04: real-path containment — symlinks escaping the package fail even
    // though stat()/hashing would follow them.
    const realTarget = await realpath(abs).catch(() => undefined);
    if (realTarget === undefined) {
      failures.push({ gate: 'closure', detail: `${label}: packaged file missing: ${rel}` });
      continue;
    }
    const relToRoot = relative(realPackageDir, realTarget);
    if (relToRoot === '' || relToRoot.startsWith('..') || isAbsolute(relToRoot)) {
      failures.push({ gate: 'closure', detail: `${label}: packaged file escapes the package directory: ${rel}` });
      continue;
    }
    const info = await stat(abs).catch(() => undefined);
    if (info === undefined) {
      failures.push({ gate: 'closure', detail: `${label}: packaged file missing: ${rel}` });
      continue;
    }
    if (info.size !== bytes) {
      failures.push({ gate: 'hash', detail: `${label}: packaged file size mismatch for ${rel}` });
    }
    const actual = await sha256File(abs).catch(() => undefined);
    if (actual !== undefined && actual !== sha256) {
      failures.push({ gate: 'hash', detail: `${label}: packaged file sha256 mismatch for ${rel} — delivered bytes diverge from the manifest` });
    }
  }
  // N04: enumerate the extracted closure — every shipped file must be
  // declared; unlisted files (renamed drops, stray backends) fail.
  const extracted = await walkPackageFiles(packageDir).catch(() => undefined);
  if (extracted !== undefined) {
    const manifestBase = packageManifestRel.split('/').pop() as string;
    for (const rel of extracted) {
      if (rel === manifestBase) {
        continue; // the record itself
      }
      if (!declared.has(rel)) {
        failures.push({ gate: 'closure', detail: `${label}: extracted file is not declared in the package record: ${rel}` });
      }
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
    } else if (!fileMap.has(licence.noticePath)) {
      // B08/CU-INST-11: every licence notice must belong to the hashed
      // model file closure so substituted notice bytes fail the hash gate.
      failures.push({ gate: 'closure', detail: `${label}: notice ${licence.noticePath} is not in the model file closure — licence provenance unbound` });
    }
  }
  return failures;
}

export function formatVerification(report: VerificationReport): string {
  const lines = [
    `release:verify — ${report.releaseVersion} (${report.artifactCount} artifacts) [${report.qualification}]`,
  ];
  if (report.failures.length === 0 && report.qualification === 'qualified') {
    lines.push('closure, hashes, platforms, licences and evidence all verified');
  } else if (report.failures.length === 0) {
    lines.push('candidate tooling validation only — NOT publication eligibility (placeholder/native/producer-only evidence remains)');
  } else {
    for (const failure of report.failures) {
      lines.push(`FAIL [${failure.gate}] ${failure.detail}`);
    }
  }
  return lines.join('\n');
}

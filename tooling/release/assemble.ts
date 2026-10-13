/**
 * release:assemble (design §7.3–7.4, M09): compose the built contracts
 * archive, plugin package and target environment package into
 * out/release-<version>/ with a generated release manifest — hashes and
 * sizes from actual bytes, requiredEvidence derived from shipped roles, and
 * lockDigests from the repository pins. Never qualifies anything: the
 * manifest declares candidate state only, and release:verify remains the
 * gate.
 */
import { copyFile, mkdir, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { isAbsolute, join, relative, resolve } from 'node:path';
import type { CommandResult } from '../cli.js';
import { sha256File } from './hash.js';
import { publishStaging, stagingFor } from './publish.js';
import { mandatorySuitesForRoles } from './suites.js';

interface AssembleInput {
  readonly releaseVersion: string;
  readonly sourceCommit: string;
  readonly target: 'win32-x64' | 'darwin-arm64';
  /** N06: explicit package directory selection (bare name under out/). */
  readonly packageDir?: string | undefined;
  /** E06: explicit package selection by manifest digest (hex of the
   * package-manifest.json bytes). Works with several builds present. */
  readonly packageDigest?: string | undefined;
}

interface PackageManifestEntry {
  readonly path: string;
  readonly role: string;
  readonly bytes: number;
  readonly sha256: string;
}

interface PackageManifestShape {
  readonly target: string;
  readonly upstreamRevision: string;
  readonly files: readonly PackageManifestEntry[];
}

interface AssembledArtifact {
  role: 'contracts' | 'plugin' | 'windows-env' | 'mac-native';
  location: string;
  bytes: number;
  sha256: string;
  platform?: string;
  signingIdentity?: string;
  qualification?: 'candidate' | 'qualified';
  noticesPath?: string;
  noticesBytes?: number;
  noticesSha256?: string;
  launchProfile?: string;
  launchProfileBytes?: number;
  launchProfileSha256?: string;
  compatibleWith: { hostAppRange: string };
}

async function exists(path: string): Promise<boolean> {
  return (await stat(path).catch(() => undefined)) !== undefined;
}

async function listPackageDirs(root: string, prefix: string): Promise<string[]> {
  if (!(await exists(root))) {
    return [];
  }
  const entries = (await readdir(root, { withFileTypes: true }))
    // B11/N08: staging and backup directories never participate in package
    // selection. Staging names carry a pid/counter suffix
    // (`<dir>.staging-<pid>-<n>`), backups a timestamp suffix — match the
    // infix, not just a `.staging` suffix.
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(prefix) && !entry.name.includes('.staging') && !entry.name.includes('.backup'))
    .map((entry) => entry.name)
    .sort();
  return entries;
}

export async function assembleRelease(repoRoot: string, input: AssembleInput): Promise<CommandResult> {
  const outRoot = join(repoRoot, 'out');
  const contractsZipName = 'computer-use-contracts-v1.zip';
  const contractsZip = join(outRoot, contractsZipName);
  if (!(await exists(contractsZip))) {
    return {
      outcome: 'missingPrerequisites',
      message: `${contractsZipName} not found under out/ — run npm run contracts:build first (assemble never builds implicitly)`,
    };
  }
  const candidates = await listPackageDirs(outRoot, `package-${input.target}-`);
  if (candidates.length === 0) {
    return {
      outcome: 'missingPrerequisites',
      message: `no package-${input.target}-* directory under out/ — run npm run package:build -- --target ${input.target} first`,
    };
  }
  // N06: explicit package selection. With multiple builds present the
  // caller must name one via --package (or --package-digest); sort-order
  // guessing stays refused.
  let packageDirName: string;
  if (input.packageDigest !== undefined) {
    if (!/^[0-9a-f]{64}$/i.test(input.packageDigest)) {
      return { outcome: 'invalidArgs', message: `invalid --package-digest '${input.packageDigest}': must be a 64-hex manifest digest` };
    }
    const matches: string[] = [];
    for (const candidate of candidates) {
      const manifestBytes = await readFile(join(outRoot, candidate, 'package-manifest.json')).catch(() => undefined);
      if (manifestBytes === undefined) {
        continue;
      }
      if (createHash('sha256').update(manifestBytes).digest('hex') === input.packageDigest.toLowerCase()) {
        matches.push(candidate);
      }
    }
    if (matches.length === 0) {
      return { outcome: 'missingPrerequisites', message: `--package-digest '${input.packageDigest.slice(0, 12)}…' matches no package-${input.target}-* manifest under out/` };
    }
    if (matches.length > 1) {
      return { outcome: 'missingPrerequisites', message: `--package-digest matches several packages (${matches.join(', ')}) — digests must identify exactly one build` };
    }
    packageDirName = matches[0] as string;
  } else if (input.packageDir !== undefined) {
    // B11: never guess between multiple builds by sort order — a stale
    // package-win32-x64-ffffffff… must not win over a fresh …-aaaaaaaa…
    // via directory sorting. Fail closed until the caller selects explicitly.
    if (input.packageDir.includes('/') || input.packageDir.includes('\\') || input.packageDir === '..' || isAbsolute(input.packageDir)) {
      return { outcome: 'invalidArgs', message: `invalid --package '${input.packageDir}': must be a bare package directory name without traversal` };
    }
    if (!input.packageDir.startsWith(`package-${input.target}-`)) {
      return { outcome: 'invalidArgs', message: `invalid --package '${input.packageDir}': does not match target '${input.target}'` };
    }
    if (input.packageDir.endsWith('.staging') || input.packageDir.includes('.staging-')) {
      return { outcome: 'invalidArgs', message: `invalid --package '${input.packageDir}': staging directories are never selectable` };
    }
    if (!candidates.includes(input.packageDir)) {
      return { outcome: 'missingPrerequisites', message: `--package '${input.packageDir}' not found under out/ (have: ${candidates.join(', ') || 'none'})` };
    }
    packageDirName = input.packageDir;
  } else if (candidates.length > 1) {
    return {
      outcome: 'missingPrerequisites',
      message: `multiple package-${input.target}-* directories under out/ (${candidates.join(', ')}) — pass --package <dir> or --package-digest <sha256> to select one explicitly; refusing to guess by sort order (B11)`,
    };
  } else {
    packageDirName = candidates[0] as string;
  }
  const packageManifestPath = join(outRoot, packageDirName, 'package-manifest.json');
  if (!(await exists(packageManifestPath))) {
    return { outcome: 'missingPrerequisites', message: `package manifest missing: ${packageManifestPath}` };
  }
  let packageManifest: PackageManifestShape;
  try {
    packageManifest = JSON.parse(await readFile(packageManifestPath, 'utf8')) as PackageManifestShape;
  } catch (error) {
    return { outcome: 'missingPrerequisites', message: `selected package manifest is not valid JSON: ${(error as Error).message}` };
  }
  if (typeof packageManifest !== 'object' || packageManifest === null || !Array.isArray(packageManifest.files) || packageManifest.files.length === 0) {
    return { outcome: 'missingPrerequisites', message: `selected package manifest lacks a non-empty files closure — incomplete staging rejected (B11)` };
  }
  // B11: validate the selected package's target/revision before assembling.
  // Wrong-target or revision-mismatched packages fail before publication,
  // and the output records the exact selected identity.
  if (packageManifest.target !== input.target) {
    return {
      outcome: 'missingPrerequisites',
      message: `selected package target '${packageManifest.target}' does not match requested target '${input.target}' — wrong-source package rejected (B11)`,
    };
  }
  if (typeof packageManifest.upstreamRevision !== 'string' || packageManifest.upstreamRevision.length === 0) {
    return {
      outcome: 'missingPrerequisites',
      message: `selected package lacks upstreamRevision identity — incomplete staging rejected (B11)`,
    };
  }
  const expectedSuffix = packageManifest.upstreamRevision.slice(0, 10);
  if (!packageDirName.endsWith(expectedSuffix)) {
    return {
      outcome: 'missingPrerequisites',
      message: `selected package directory ${packageDirName} does not match its upstreamRevision ${packageManifest.upstreamRevision.slice(0, 12)}… — wrong revision rejected (B11)`,
    };
  }
  // N06: full package provenance — the package's own revision must equal
  // the checkout lock's selected revision exactly (not just the directory
  // suffix), so a stale package can never be combined with current locks.
  const upstreamLockRel = input.target === 'win32-x64' ? 'adapters/windows/upstream.lock' : 'adapters/macos/ghost-os/upstream.lock';
  const checkoutLockRaw = await readFile(join(repoRoot, upstreamLockRel), 'utf8').catch(() => undefined);
  if (checkoutLockRaw === undefined) {
    return { outcome: 'missingPrerequisites', message: `${upstreamLockRel} unreadable — package provenance cannot be established` };
  }
  let checkoutRevision: unknown;
  try {
    checkoutRevision = (JSON.parse(checkoutLockRaw) as { selectedRevision?: unknown }).selectedRevision;
  } catch {
    return { outcome: 'missingPrerequisites', message: `${upstreamLockRel} is not valid JSON — package provenance cannot be established` };
  }
  if (typeof checkoutRevision !== 'string' || checkoutRevision.length === 0) {
    return {
      outcome: 'missingPrerequisites',
      message: `${upstreamLockRel} has no selectedRevision — package provenance cannot be established (pin the revision first)`,
    };
  }
  if (checkoutRevision !== packageManifest.upstreamRevision) {
    return {
      outcome: 'missingPrerequisites',
      message: `selected package revision ${packageManifest.upstreamRevision.slice(0, 12)}… does not match ${upstreamLockRel} revision ${checkoutRevision.slice(0, 12)}… — stale package rejected (N06)`,
    };
  }

  // B12: validate output-path components before touching the filesystem.
  // Reject traversal and non-version names; never silently replace a
  // published identity via a crafted version string.
  if (!/^[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9.-]+)?$/.test(input.releaseVersion) || input.releaseVersion.includes('..') || input.releaseVersion.includes('/')) {
    return {
      outcome: 'invalidArgs',
      message: `invalid --release-version '${input.releaseVersion}': must be X.Y.Z[-suffix] without path traversal (B12)`,
    };
  }
  if (!/^[0-9a-f]{7,40}(-dirty)?$/i.test(input.sourceCommit)) {
    return {
      outcome: 'invalidArgs',
      message: `invalid --source-commit '${input.sourceCommit}': must be a commit-shaped hex identity (B07)`,
    };
  }

  const releaseDir = join(outRoot, `release-${input.releaseVersion}`);
  // N08: unique staging per call — concurrent runs never share or delete
  // each other's staging directory.
  const staging = stagingFor(releaseDir);
  // B12: build and validate fresh staging BEFORE replacing any existing
  // candidate. The previous final bytes stay intact if any later step
  // fails; only a fully validated staging is swapped in.

  const artifacts: AssembledArtifact[] = [];

  // Contracts artifact metadata from actual bytes (copied after preflight).
  const contractsBytes = (await stat(contractsZip)).size;
  const contractsSha = await sha256File(contractsZip);
  artifacts.push({
    role: 'contracts',
    location: contractsZipName,
    bytes: contractsBytes,
    sha256: contractsSha,
    compatibleWith: { hostAppRange: '>=0.1.0' },
  });

  // Backend/plugin resources from the target package closure.
  const envRole: AssembledArtifact['role'] = input.target === 'win32-x64' ? 'windows-env' : 'mac-native';
  // N06/N07: pre-copy verification — every entry is schema/containment/hash
  // checked against the source package BEFORE any filesystem mutation, so
  // corrupt files, wrong digests and traversal paths fail with staging,
  // neighboring artifacts and previous candidates untouched. Same-length
  // backend tampering that retains the manifest hash is caught here by
  // rehashing source bytes.
  const seenPaths = new Set<string>();
  const seenDests = new Set<string>();
  const realOutRoot = await realpath(outRoot).catch(() => outRoot);
  for (const file of packageManifest.files) {
    if (typeof file.path !== 'string' || typeof file.bytes !== 'number' || typeof file.sha256 !== 'string' || typeof file.role !== 'string') {
      return { outcome: 'missingPrerequisites', message: `selected package entry lacks path/role/bytes/sha256 — incomplete staging rejected` };
    }
    if (isAbsolute(file.path) || file.path.split('/').includes('..') || file.path.split('\\').includes('..')) {
      return { outcome: 'missingPrerequisites', message: `selected package entry escapes its directory: ${file.path} — rejected before any copy (N07)` };
    }
    if (seenPaths.has(file.path)) {
      return { outcome: 'missingPrerequisites', message: `selected package declares duplicate path: ${file.path} — rejected (N07)` };
    }
    seenPaths.add(file.path);
    const dest = resolve(staging, 'package', file.path);
    const destRel = relative(resolve(staging), dest);
    if (destRel === '' || destRel.startsWith('..') || isAbsolute(destRel) || seenDests.has(destRel)) {
      return { outcome: 'missingPrerequisites', message: `selected package entry collides outside staging: ${file.path} — rejected (N07)` };
    }
    seenDests.add(destRel);
    const source = join(outRoot, packageDirName, file.path);
    const realSource = await realpath(source).catch(() => undefined);
    if (realSource === undefined) {
      return { outcome: 'missingPrerequisites', message: `selected package file missing: ${file.path} — incomplete staging rejected` };
    }
    const sourceRel = relative(realOutRoot, realSource);
    if (sourceRel === '' || sourceRel.startsWith('..') || isAbsolute(sourceRel)) {
      return { outcome: 'missingPrerequisites', message: `selected package source escapes the build tree: ${file.path} — rejected (N07)` };
    }
    const sourceStat = await stat(source).catch(() => undefined);
    if (sourceStat === undefined || sourceStat.size !== file.bytes) {
      return { outcome: 'missingPrerequisites', message: `selected package file size mismatch for ${file.path} — corrupt package rejected (N06)` };
    }
    const sourceSha = await sha256File(source).catch(() => undefined);
    if (sourceSha !== file.sha256) {
      return { outcome: 'missingPrerequisites', message: `selected package file sha256 mismatch for ${file.path} — delivered bytes diverge from the manifest (N06)` };
    }
  }
  // Preflight complete with zero mutations so far — now stage.
  await mkdir(join(staging, 'package'), { recursive: true });
  // Contracts artifact: the built archive zip, copied as-is.
  await copyFile(contractsZip, join(staging, contractsZipName));
  await copyFile(packageManifestPath, join(staging, 'package', 'package-manifest.json'));
  for (const file of packageManifest.files) {
    const source = join(outRoot, packageDirName, file.path);
    const destination = join(staging, 'package', file.path);
    await mkdir(join(destination, '..'), { recursive: true });
    await copyFile(source, destination);
    if (file.role === 'env-input' && (file.path.endsWith('launch-profile.json') || file.path.endsWith('upstream.lock'))) {
      continue; // referenced, not separately listed
    }
    if (file.path === 'plugin/manifest.json' || file.path === 'THIRD_PARTY_NOTICES') {
      const stagedPath = join(staging, 'package', file.path);
      const stagedStat = await stat(stagedPath);
      const stagedSha = await sha256File(stagedPath);
      artifacts.push({
        role: 'plugin',
        location: `package/${file.path}`,
        bytes: file.bytes,
        sha256: file.sha256,
        compatibleWith: { hostAppRange: '>=0.1.0' },
        // N05: bound notice digests for THIRD_PARTY_NOTICES.
        ...(file.path === 'THIRD_PARTY_NOTICES'
          ? { noticesPath: `package/${file.path}`, noticesBytes: stagedStat.size, noticesSha256: stagedSha }
          : {}),
      });
    }
  }
  const envManifestPath = join(staging, 'package', 'package-manifest.json');
  const launchProfileRel = packageManifest.files.find((f) => f.path.endsWith('launch-profile.json'))?.path;
  // N05: bound launch-profile digest so profile bytes cannot drift.
  let launchProfileBytes: number | undefined;
  let launchProfileSha256: string | undefined;
  if (launchProfileRel !== undefined) {
    const stagedProfile = join(staging, 'package', launchProfileRel);
    launchProfileBytes = (await stat(stagedProfile)).size;
    launchProfileSha256 = await sha256File(stagedProfile);
  }
  // N12: the mac-native artifact is the extracted helper binary itself —
  // never the package JSON — with an explicit candidate qualification until
  // the T07 selection records a real signing identity.
  if (envRole === 'mac-native') {
    const helperEntry = packageManifest.files.find(
      (f) => f.path === 'helper' || f.path.endsWith('/helper'),
    );
    if (helperEntry === undefined) {
      await rm(staging, { recursive: true, force: true }).catch(() => undefined);
      return {
        outcome: 'missingPrerequisites',
        message: 'selected mac package has no helper binary — the T07 helper selection must land before mac assembly (N12)',
      };
    }
    const stagedHelper = join(staging, 'package', helperEntry.path);
    artifacts.push({
      role: envRole,
      location: `package/${helperEntry.path}`,
      bytes: (await stat(stagedHelper)).size,
      sha256: await sha256File(stagedHelper),
      platform: input.target,
      signingIdentity: 'PENDING-mac-helper-selection (candidate)',
      qualification: 'candidate',
      ...(launchProfileRel !== undefined
        ? {
            launchProfile: `package/${launchProfileRel}`,
            launchProfileBytes: launchProfileBytes as number,
            launchProfileSha256: launchProfileSha256 as string,
          }
        : {}),
      compatibleWith: { hostAppRange: '>=0.1.0' },
    });
  } else {
    artifacts.push({
      role: envRole,
      // The environment closure record is the artifact; the launch profile is
      // referenced from it and containment/existence-checked by verify.
      location: 'package/package-manifest.json',
      bytes: (await stat(envManifestPath)).size,
      sha256: await sha256File(envManifestPath),
      platform: input.target,
      ...(launchProfileRel !== undefined
        ? {
            launchProfile: `package/${launchProfileRel}`,
            launchProfileBytes: launchProfileBytes as number,
            launchProfileSha256: launchProfileSha256 as string,
          }
        : {}),
      compatibleWith: { hostAppRange: '>=0.1.0' },
    });
  }

  // Lock digests from the repository pins that produced this candidate.
  const lockDigests: Record<string, string> = {};
  for (const lockRelative of input.target === 'win32-x64'
    ? ['adapters/windows/upstream.lock', 'adapters/windows/uv.lock']
    : ['adapters/macos/ghost-os/upstream.lock']) {
    const absolute = join(repoRoot, lockRelative);
    if (await exists(absolute)) {
      lockDigests[lockRelative] = await sha256File(absolute);
    }
  }

  const requiredEvidence = mandatorySuitesForRoles(artifacts.map((a) => a.role));
  const manifest = {
    schemaVersion: 1,
    releaseVersion: input.releaseVersion,
    sourceCommit: input.sourceCommit,
    lockDigests,
    contractArchive: { version: 'v1', sha256: artifacts[0]!.sha256 },
    requiredEvidence,
    artifacts,
    // B11: exact selected package identity — which out/ build was combined
    // with current source/lock metadata.
    selectedPackage: { dir: packageDirName, target: packageManifest.target, upstreamRevision: packageManifest.upstreamRevision },
  };
  await writeFile(join(staging, 'release.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  // B12: validate staging before swapping — every artifact must exist with
  // matching size. On any failure the previous releaseDir is untouched.
  try {
    for (const artifact of artifacts) {
      const staged = join(staging, artifact.location);
      const info = await stat(staged).catch(() => undefined);
      if (info === undefined) {
        await rm(staging, { recursive: true, force: true });
        return { outcome: 'failed', message: `assembly staging incomplete: ${artifact.location} missing — previous candidate preserved` };
      }
      if (info.size !== artifact.bytes) {
        await rm(staging, { recursive: true, force: true });
        return { outcome: 'failed', message: `assembly staging size mismatch for ${artifact.location} — previous candidate preserved` };
      }
    }
  } catch (error) {
    await rm(staging, { recursive: true, force: true }).catch(() => undefined);
    return { outcome: 'failed', message: `assembly staging validation failed: ${(error as Error).message} — previous candidate preserved` };
  }
  // N08: recoverable publish — the previous candidate is moved aside, not
  // deleted; a failed final rename restores it instead of leaving no output.
  const published = await publishStaging(staging, releaseDir);
  if (published.outcome !== 'ok') {
    return { outcome: 'failed', message: `assembly ${published.message}` };
  }

  return {
    outcome: 'ok',
    message: [
      `release assembled: ${input.releaseVersion} (${artifacts.length} artifacts, target ${input.target})`,
      `dir: ${releaseDir}`,
      `required evidence: ${requiredEvidence.join(', ')}`,
    ].join('\n'),
    result: manifest,
  };
}

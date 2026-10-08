/**
 * release:assemble (design §7.3–7.4, M09): compose the built contracts
 * archive, plugin package and target environment package into
 * out/release-<version>/ with a generated release manifest — hashes and
 * sizes from actual bytes, requiredEvidence derived from shipped roles, and
 * lockDigests from the repository pins. Never qualifies anything: the
 * manifest declares candidate state only, and release:verify remains the
 * gate.
 */
import { copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CommandResult } from '../cli.js';
import { sha256File } from './hash.js';

interface AssembleInput {
  readonly releaseVersion: string;
  readonly sourceCommit: string;
  readonly target: 'win32-x64' | 'darwin-arm64';
}

interface AssembledArtifact {
  role: 'contracts' | 'plugin' | 'windows-env' | 'mac-native';
  location: string;
  bytes: number;
  sha256: string;
  platform?: string;
  noticesPath?: string;
  launchProfile?: string;
  compatibleWith: { hostAppRange: string };
}

/** Map a role to the mandatory evidence suites the release must carry (E04). */
function mandatorySuites(roles: readonly AssembledArtifact['role'][]): readonly string[] {
  const suites = new Set<string>();
  for (const role of roles) {
    if (role === 'contracts') suites.add('contract-conformance');
    if (role === 'windows-env' || role === 'mac-native') suites.add(`${role}-native`);
    if (role === 'windows-env' || role === 'mac-native') suites.add('host-consumer');
  }
  return [...suites].sort();
}

async function exists(path: string): Promise<boolean> {
  return (await stat(path).catch(() => undefined)) !== undefined;
}

async function latestDir(root: string, prefix: string): Promise<string | undefined> {
  if (!(await exists(root))) {
    return undefined;
  }
  const entries = (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(prefix))
    .map((entry) => entry.name)
    .sort();
  return entries.length > 0 ? entries[entries.length - 1] : undefined;
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
  const packageDirName = await latestDir(outRoot, `package-${input.target}-`);
  if (packageDirName === undefined) {
    return {
      outcome: 'missingPrerequisites',
      message: `no package-${input.target}-* directory under out/ — run npm run package:build -- --target ${input.target} first`,
    };
  }
  const packageManifestPath = join(outRoot, packageDirName, 'package-manifest.json');
  if (!(await exists(packageManifestPath))) {
    return { outcome: 'missingPrerequisites', message: `package manifest missing: ${packageManifestPath}` };
  }
  const packageManifest = JSON.parse(await readFile(packageManifestPath, 'utf8')) as {
    target: string;
    upstreamRevision: string;
    files: { path: string; role: string; bytes: number; sha256: string }[];
  };

  const releaseDir = join(outRoot, `release-${input.releaseVersion}`);
  const staging = `${releaseDir}.staging`;
  await rm(staging, { recursive: true, force: true });
  await rm(releaseDir, { recursive: true, force: true });
  await mkdir(join(staging, 'package'), { recursive: true });

  const artifacts: AssembledArtifact[] = [];

  // Contracts artifact: the built archive zip, copied as-is.
  await copyFile(contractsZip, join(staging, contractsZipName));
  artifacts.push({
    role: 'contracts',
    location: contractsZipName,
    bytes: (await stat(contractsZip)).size,
    sha256: await sha256File(contractsZip),
    compatibleWith: { hostAppRange: '>=0.1.0' },
  });

  // Backend/plugin resources from the target package closure.
  const envRole: AssembledArtifact['role'] = input.target === 'win32-x64' ? 'windows-env' : 'mac-native';
  // The package's own manifest ships as the environment closure record.
  await mkdir(join(staging, 'package'), { recursive: true });
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
      artifacts.push({
        role: 'plugin',
        location: `package/${file.path}`,
        bytes: file.bytes,
        sha256: file.sha256,
        compatibleWith: { hostAppRange: '>=0.1.0' },
        ...(file.path === 'THIRD_PARTY_NOTICES' ? { noticesPath: `package/${file.path}` } : {}),
      });
    }
  }
  const envManifestPath = join(staging, 'package', 'package-manifest.json');
  const launchProfileRel = packageManifest.files.find((f) => f.path.endsWith('launch-profile.json'))?.path;
  artifacts.push({
    role: envRole,
    // The environment closure record is the artifact; the launch profile is
    // referenced from it and containment/existence-checked by verify.
    location: 'package/package-manifest.json',
    bytes: (await stat(envManifestPath)).size,
    sha256: await sha256File(envManifestPath),
    platform: input.target,
    ...(launchProfileRel !== undefined ? { launchProfile: `package/${launchProfileRel}` } : {}),
    compatibleWith: { hostAppRange: '>=0.1.0' },
  });

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

  const requiredEvidence = mandatorySuites(artifacts.map((a) => a.role));
  const manifest = {
    schemaVersion: 1,
    releaseVersion: input.releaseVersion,
    sourceCommit: input.sourceCommit,
    lockDigests,
    contractArchive: { version: 'v1', sha256: artifacts[0]!.sha256 },
    requiredEvidence,
    artifacts,
  };
  await writeFile(join(staging, 'release.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await rm(staging.replace(/\.staging$/, ''), { recursive: true, force: true }).catch(() => undefined);
  await rename(staging, releaseDir);

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

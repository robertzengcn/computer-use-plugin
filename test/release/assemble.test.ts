import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile, cp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { assembleRelease } from '../../tooling/release/assemble.js';
import { verifyRelease } from '../../tooling/release/verify.js';
import { packageBuild } from '../../tooling/commands/package.js';
import { buildContractArchive } from '../../tooling/contracts/archive.js';

const REPO = process.cwd();
const cleanups: string[] = [];

async function tempRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cu-rel-asm-'));
  cleanups.push(root);
  await cp(join(REPO, 'contracts'), join(root, 'contracts'), { recursive: true });
  await cp(join(REPO, 'plugin'), join(root, 'plugin'), { recursive: true });
  await writeFile(join(root, 'THIRD_PARTY_NOTICES'), 'notices\n');
  await mkdir(join(root, 'adapters', 'windows', 'src', 'aifetchly_windows'), { recursive: true });
  const uv = 'lock bytes\n';
  await writeFile(join(root, 'adapters', 'windows', 'upstream.lock'), JSON.stringify({
    status: 'pinned', selectedRevision: 'a'.repeat(40), pythonVersion: '3.14.4',
    sourceSha256: 'b'.repeat(64), dependencyLockSha256: createHash('sha256').update(uv).digest('hex'),
    component: 'windows-mcp-backend', upstream: 'https://example/W',
  }));
  await writeFile(join(root, 'adapters', 'windows', 'launch-profile.json'),
    '{"version":1,"transport":"stdio-jsonrpc","argvTemplate":["<managed-python>","-u","-m","aifetchly_windows.entrypoint"],"cwd":"<managed-env-root>","envPolicy":{"inherit":["SYSTEMROOT"],"telemetry":"disabled","noGlobalPath":true,"extra":{"PYTHONUNBUFFERED":"1"}},"stdoutPolicy":"protocol-only","upstreamLockRequired":"pinned"}');
  await writeFile(join(root, 'adapters', 'windows', 'tool-allowlist.json'),
    '{"version":1,"policy":"deny-by-default","allow":["click"],"deny":[]}');
  await writeFile(join(root, 'adapters', 'windows', 'uv.lock'), uv);
  await writeFile(join(root, 'adapters', 'windows', 'pyproject.toml'), '[project]\n');
  await writeFile(join(root, 'adapters', 'windows', 'src', 'aifetchly_windows', '__init__.py'), '');
  await writeFile(join(root, 'adapters', 'windows', 'src', 'aifetchly_windows', 'entrypoint.py'), 'def main():\n    return 0\n');
  return root;
}

afterAll(async () => {
  for (const dir of cleanups) {
    await rm(dir, { recursive: true, force: true });
  }
});

describe('release:assemble (M09)', () => {
  it('composes contracts+package into a candidate release with derived evidence requirements', async () => {
    const root = await tempRepo();
    // Build prerequisites explicitly — assemble never builds implicitly.
    const archive = await buildContractArchive(root, join(root, 'out'));
    const pkg = await packageBuild(root, 'win32-x64', join(root, 'out'));
    expect(archive.fileCount).toBeGreaterThan(0);
    expect(pkg.outcome).toBe('ok');

    const result = await assembleRelease(root, { releaseVersion: '0.2.0-rc.1', sourceCommit: 'deadbee', target: 'win32-x64' });
    expect(result.outcome).toBe('ok');
    const manifest = result.result as {
      requiredEvidence: string[];
      contractArchive: { sha256: string };
      artifacts: { role: string; location: string; bytes: number; sha256: string }[];
      lockDigests: Record<string, string>;
    };
    // Role-derived mandatory suites via the canonical registry (B10),
    // not caller-supplied. windows-env maps to windows-native (never
    // windows-env-native) and mac-native maps to mac-native.
    expect(manifest.requiredEvidence).toContain('windows-native');
    expect(manifest.requiredEvidence).toContain('host-consumer');
    expect(manifest.requiredEvidence).toContain('contract-conformance');
    // Contract digest bound to the actual zip bytes.
    const zipBytes = await readFile(join(root, 'out', 'computer-use-contracts-v1.zip'));
    expect(manifest.contractArchive.sha256).toBe(createHash('sha256').update(zipBytes).digest('hex'));
    // Lock digests recorded from the repository pins.
    expect(manifest.lockDigests['adapters/windows/upstream.lock']).toBeDefined();
    // Every listed artifact exists with matching size.
    for (const artifact of manifest.artifacts) {
      const info = await stat(join(root, 'out', 'release-0.2.0-rc.1', artifact.location));
      expect(info.size).toBe(artifact.bytes);
    }
  });

  it('assembling without built prerequisites fails closed with named steps', async () => {
    const root = await tempRepo();
    const result = await assembleRelease(root, { releaseVersion: '0.3.0', sourceCommit: 'x', target: 'win32-x64' });
    expect(result.outcome).toBe('missingPrerequisites');
    expect(result.message).toMatch(/contracts:build/);
  });

  it('the assembled release verifies via release:verify up to its declared evidence gates', async () => {
    const root = await tempRepo();
    await buildContractArchive(root, join(root, 'out'));
    await packageBuild(root, 'win32-x64', join(root, 'out'));
    const result = await assembleRelease(root, { releaseVersion: '0.4.0-rc.1', sourceCommit: 'deadbee', target: 'win32-x64' });
    expect(result.outcome).toBe('ok');
    // Verify from the repo root context so lockDigests resolve (cwd contract).
    const previous = process.cwd();
    process.chdir(root);
    try {
      const report = await verifyRelease(
        join(root, 'out', 'release-0.4.0-rc.1', 'release.json'),
        join(REPO, 'tooling', 'release', 'schemas', 'release-manifest-v1.schema.json'),
      );
      const details = report.failures.map((f) => f.detail).join('\n');
      // The declared-but-missing evidence must be exactly what fails — no
      // closure/hash/platform failures on the assembled bytes themselves.
      expect(report.failures.length).toBeGreaterThan(0);
      expect(details).toMatch(/windows-native|host-consumer|contract-conformance/);
      expect(details).not.toMatch(/sha256 mismatch|size \d+ != declared/);
    } finally {
      process.chdir(previous);
    }
  });

  it('rebuilding the same version replaces the directory atomically (no stale mixture)', async () => {
    const root = await tempRepo();
    await buildContractArchive(root, join(root, 'out'));
    await packageBuild(root, 'win32-x64', join(root, 'out'));
    const first = await assembleRelease(root, { releaseVersion: '0.5.0', sourceCommit: 'abc1234', target: 'win32-x64' });
    expect(first.outcome).toBe('ok');
    const releaseDir = join(root, 'out', 'release-0.5.0');
    await writeFile(join(releaseDir, 'stale.txt'), 'stale');
    const second = await assembleRelease(root, { releaseVersion: '0.5.0', sourceCommit: 'abc1234', target: 'win32-x64' });
    expect(second.outcome).toBe('ok');
    expect(await stat(join(releaseDir, 'stale.txt')).catch(() => undefined)).toBeUndefined();
  });

  it('B11: multiple package builds fail closed instead of guessing by sort order', async () => {
    const root = await tempRepo();
    await buildContractArchive(root, join(root, 'out'));
    await packageBuild(root, 'win32-x64', join(root, 'out'));
    // Forge a second stale package directory with a different revision.
    const { readdir } = await import('node:fs/promises');
    const outEntries = await readdir(join(root, 'out'));
    const pkgDir = outEntries.find((e) => e.startsWith('package-win32-x64-'))!;
    await cp(join(root, 'out', pkgDir), join(root, 'out', 'package-win32-x64-ffffffff00'), { recursive: true });
    const result = await assembleRelease(root, { releaseVersion: '0.6.0', sourceCommit: 'abc1234', target: 'win32-x64' });
    expect(result.outcome).toBe('missingPrerequisites');
    expect(result.message).toMatch(/multiple package.*refusing to guess/);
  });

  it('N-review: leftover unique staging dirs never join package selection', async () => {
    const root = await tempRepo();
    await buildContractArchive(root, join(root, 'out'));
    await packageBuild(root, 'win32-x64', join(root, 'out'));
    const { readdir } = await import('node:fs/promises');
    const outEntries = await readdir(join(root, 'out'));
    const pkgDir = outEntries.find((e) => e.startsWith('package-win32-x64-'))!;
    // Simulate a crashed run's leftover staging with the new unique suffix.
    await mkdir(join(root, 'out', `${pkgDir}.staging-12345-7`), { recursive: true });
    const result = await assembleRelease(root, { releaseVersion: '0.6.1', sourceCommit: 'abc1234', target: 'win32-x64' });
    expect(result.outcome).toBe('ok');
  });

  it('B11/B12: traversal versions and bad commits are rejected before touching output', async () => {
    const root = await tempRepo();
    await buildContractArchive(root, join(root, 'out'));
    await packageBuild(root, 'win32-x64', join(root, 'out'));
    const traversal = await assembleRelease(root, { releaseVersion: '../evil', sourceCommit: 'abc1234', target: 'win32-x64' });
    expect(traversal.outcome).toBe('invalidArgs');
    expect(traversal.message).toMatch(/without path traversal/);
    const badCommit = await assembleRelease(root, { releaseVersion: '0.7.0', sourceCommit: 'NOT-A-COMMIT', target: 'win32-x64' });
    expect(badCommit.outcome).toBe('invalidArgs');
    expect(badCommit.message).toMatch(/commit-shaped/);
  });

  it('N06: explicit --package selection works with multiple builds present', async () => {
    const root = await tempRepo();
    await buildContractArchive(root, join(root, 'out'));
    await packageBuild(root, 'win32-x64', join(root, 'out'));
    const { readdir } = await import('node:fs/promises');
    const outEntries = await readdir(join(root, 'out'));
    const pkgDir = outEntries.find((e) => e.startsWith('package-win32-x64-'))!;
    await cp(join(root, 'out', pkgDir), join(root, 'out', 'package-win32-x64-ffffffff00'), { recursive: true });
    const result = await assembleRelease(root, {
      releaseVersion: '0.8.0', sourceCommit: 'abc1234', target: 'win32-x64', packageDir: pkgDir,
    });
    expect(result.outcome).toBe('ok');
    expect((result.result as { selectedPackage: { dir: string } }).selectedPackage.dir).toBe(pkgDir);
  });

  it('N06: stale package with a mismatched lock revision fails before output', async () => {
    const root = await tempRepo();
    await buildContractArchive(root, join(root, 'out'));
    await packageBuild(root, 'win32-x64', join(root, 'out'));
    // Rotate the checkout lock to a new revision; the built package is now stale.
    const uv = 'lock bytes\n';
    await writeFile(join(root, 'adapters', 'windows', 'upstream.lock'), JSON.stringify({
      status: 'pinned', selectedRevision: 'b'.repeat(40), pythonVersion: '3.14.4',
      sourceSha256: 'b'.repeat(64), dependencyLockSha256: createHash('sha256').update(uv).digest('hex'),
      component: 'windows-mcp-backend', upstream: 'https://example/W',
    }));
    const result = await assembleRelease(root, { releaseVersion: '0.9.0', sourceCommit: 'abc1234', target: 'win32-x64' });
    expect(result.outcome).toBe('missingPrerequisites');
    expect(result.message).toMatch(/stale package rejected/);
  });

  it('N06: same-length backend tampering with a retained manifest hash fails', async () => {
    const root = await tempRepo();
    await buildContractArchive(root, join(root, 'out'));
    await packageBuild(root, 'win32-x64', join(root, 'out'));
    const { readdir } = await import('node:fs/promises');
    const outEntries = await readdir(join(root, 'out'));
    const pkgDir = outEntries.find((e) => e.startsWith('package-win32-x64-'))!;
    // Same-length content swap in a delivered backend file; the manifest
    // still declares the original hash.
    await writeFile(join(root, 'out', pkgDir, 'adapters', 'windows', 'src', 'aifetchly_windows', 'entrypoint.py'), 'def main():\n    return 1\n');
    const result = await assembleRelease(root, { releaseVersion: '0.10.0', sourceCommit: 'abc1234', target: 'win32-x64' });
    expect(result.outcome).toBe('missingPrerequisites');
    expect(result.message).toMatch(/diverge from the manifest/);
  });

  it('N06: release:assemble rejects unsupported flags instead of ignoring them', async () => {
    const { COMMANDS } = await import('../../tooling/commands.js');
    const assemble = COMMANDS.find((c) => c.name === 'release:assemble')!;
    const result = await assemble.handler(
      { positionals: ['release:assemble'], flags: new Map([['bogus-flag', true]]) },
      { cwd: process.cwd() },
    );
    expect(result.outcome).toBe('invalidArgs');
    expect(result.message).toMatch(/unsupported --bogus-flag/);
  });

  it('E06: selection by package digest works with several builds present', async () => {
    const root = await tempRepo();
    await buildContractArchive(root, join(root, 'out'));
    await packageBuild(root, 'win32-x64', join(root, 'out'));
    const { readdir, readFile: readOutFile } = await import('node:fs/promises');
    const outEntries = await readdir(join(root, 'out'));
    const pkgDir = outEntries.find((e) => e.startsWith('package-win32-x64-'))!;
    await cp(join(root, 'out', pkgDir), join(root, 'out', 'package-win32-x64-ffffffff00'), { recursive: true });
    // Give the forged copy a distinct manifest digest without touching its
    // file closure (selection is by manifest bytes).
    const forgedManifestPath = join(root, 'out', 'package-win32-x64-ffffffff00', 'package-manifest.json');
    const forged = JSON.parse(await readOutFile(forgedManifestPath, 'utf8')) as Record<string, unknown>;
    forged._testNote = 'forged duplicate build';
    await writeFile(forgedManifestPath, JSON.stringify(forged));
    const manifestBytes = await readOutFile(join(root, 'out', pkgDir, 'package-manifest.json'));
    const digest = createHash('sha256').update(manifestBytes).digest('hex');
    const result = await assembleRelease(root, {
      releaseVersion: '0.14.0', sourceCommit: 'abc1234', target: 'win32-x64', packageDigest: digest,
    });
    expect(result.outcome).toBe('ok');
    expect((result.result as { selectedPackage: { dir: string } }).selectedPackage.dir).toBe(pkgDir);
    const unknown = await assembleRelease(root, {
      releaseVersion: '0.14.1', sourceCommit: 'abc1234', target: 'win32-x64', packageDigest: '0'.repeat(64),
    });
    expect(unknown.outcome).toBe('missingPrerequisites');
    expect(unknown.message).toMatch(/matches no package/);
  });

  it('N12: mac assembly without a helper binary fails closed', async () => {
    const root = await tempRepo();
    await buildContractArchive(root, join(root, 'out'));
    // Hand-crafted mac package without any helper binary.
    const rev = 'c'.repeat(40);
    const pkgDir = `package-darwin-arm64-${rev.slice(0, 10)}`;
    await mkdir(join(root, 'out', pkgDir), { recursive: true });
    await writeFile(
      join(root, 'out', pkgDir, 'package-manifest.json'),
      JSON.stringify({ target: 'darwin-arm64', upstreamRevision: rev, files: [] }),
    );
    await mkdir(join(root, 'adapters', 'macos', 'ghost-os'), { recursive: true });
    await writeFile(
      join(root, 'adapters', 'macos', 'ghost-os', 'upstream.lock'),
      JSON.stringify({ status: 'pinned', selectedRevision: rev }),
    );
    const result = await assembleRelease(root, { releaseVersion: '0.13.0', sourceCommit: 'abc1234', target: 'darwin-arm64' });
    expect(result.outcome).toBe('missingPrerequisites');
    expect(result.message).toMatch(/incomplete staging|no helper binary/);
  });

  it('N07: traversal package entries are rejected before any outside read/write', async () => {
    const root = await tempRepo();
    await buildContractArchive(root, join(root, 'out'));
    await packageBuild(root, 'win32-x64', join(root, 'out'));
    const { readdir, readFile: readOutFile } = await import('node:fs/promises');
    const outEntries = await readdir(join(root, 'out'));
    const pkgDir = outEntries.find((e) => e.startsWith('package-win32-x64-'))!;
    // Neighbor marker inside out/ plus a previous good candidate release.
    const neighbor = join(root, 'out', 'neighbor.txt');
    await writeFile(neighbor, 'neighbor-bytes');
    const first = await assembleRelease(root, { releaseVersion: '0.11.0', sourceCommit: 'abc1234', target: 'win32-x64' });
    expect(first.outcome).toBe('ok');
    const previousRelease = join(root, 'out', 'release-0.11.0', 'release.json');
    const previousBytes = await readOutFile(previousRelease);
    // Poison the package record with a traversal entry pointing outside.
    const manifestPath = join(root, 'out', pkgDir, 'package-manifest.json');
    const pkgManifest = JSON.parse(await readOutFile(manifestPath, 'utf8')) as {
      files: { path: string; role: string; bytes: number; sha256: string }[];
    };
    await writeFile(join(root, 'outside-source.txt'), 'outside-bytes');
    pkgManifest.files.push({ path: '../../outside-source.txt', role: 'backend', bytes: 14, sha256: '0'.repeat(64) });
    await writeFile(manifestPath, JSON.stringify(pkgManifest));
    const result = await assembleRelease(root, { releaseVersion: '0.12.0', sourceCommit: 'abc1234', target: 'win32-x64' });
    expect(result.outcome).toBe('missingPrerequisites');
    expect(result.message).toMatch(/rejected before any copy/);
    // Failed preflight left the neighbor and the previous candidate identical,
    // and wrote nothing outside staging.
    expect(await readOutFile(neighbor, 'utf8')).toBe('neighbor-bytes');
    expect(await readOutFile(previousRelease)).toEqual(previousBytes);
    expect(await readOutFile(join(root, 'outside-source.txt'), 'utf8')).toBe('outside-bytes');
    const outAfter = await readdir(join(root, 'out'));
    expect(outAfter).not.toContain('outside-source.txt');
  });
});

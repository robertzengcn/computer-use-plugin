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
    '{"version":1,"transport":"stdio-jsonrpc","argvTemplate":["<managed-python>","-m","aifetchly_windows.entrypoint"],"cwd":"<managed-env-root>","envPolicy":{"inherit":["SYSTEMROOT"],"telemetry":"disabled","noGlobalPath":true},"stdoutPolicy":"protocol-only","upstreamLockRequired":"pinned"}');
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
    // Role-derived mandatory suites (E04 policy), not caller-supplied.
    expect(manifest.requiredEvidence).toContain('windows-env-native');
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
      expect(details).toMatch(/windows-env-native|host-consumer|contract-conformance/);
      expect(details).not.toMatch(/sha256 mismatch|size \d+ != declared/);
    } finally {
      process.chdir(previous);
    }
  });

  it('rebuilding the same version replaces the directory atomically (no stale mixture)', async () => {
    const root = await tempRepo();
    await buildContractArchive(root, join(root, 'out'));
    await packageBuild(root, 'win32-x64', join(root, 'out'));
    const first = await assembleRelease(root, { releaseVersion: '0.5.0', sourceCommit: 'a', target: 'win32-x64' });
    expect(first.outcome).toBe('ok');
    const releaseDir = join(root, 'out', 'release-0.5.0');
    await writeFile(join(releaseDir, 'stale.txt'), 'stale');
    const second = await assembleRelease(root, { releaseVersion: '0.5.0', sourceCommit: 'a', target: 'win32-x64' });
    expect(second.outcome).toBe('ok');
    expect(await stat(join(releaseDir, 'stale.txt')).catch(() => undefined)).toBeUndefined();
  });
});

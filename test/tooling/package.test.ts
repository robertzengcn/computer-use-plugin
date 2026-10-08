import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { packageBuild } from '../../tooling/commands/package.js';

const REPO = process.cwd();

async function tempRepoWith(target: 'win32-x64' | 'darwin-arm64', lock: object): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cu-pkg-'));
  await cp(join(REPO, 'plugin'), join(root, 'plugin'), { recursive: true });
  await cp(join(REPO, 'contracts'), join(root, 'contracts'), { recursive: true });
  await writeFile(join(root, 'THIRD_PARTY_NOTICES'), 'notices\n');
  if (target === 'win32-x64') {
    await mkdir(join(root, 'adapters', 'windows', 'src', 'aifetchly_windows'), { recursive: true });
    await writeFile(join(root, 'adapters', 'windows', 'upstream.lock'), JSON.stringify(lock));
    await writeFile(join(root, 'adapters', 'windows', 'launch-profile.json'), '{}');
    await writeFile(join(root, 'adapters', 'windows', 'tool-allowlist.json'), '{}');
    await writeFile(join(root, 'adapters', 'windows', 'uv.lock'), 'lock\n');
    await writeFile(join(root, 'adapters', 'windows', 'pyproject.toml'), '[project]\n');
    await writeFile(join(root, 'adapters', 'windows', 'src', 'aifetchly_windows', '__init__.py'), '');
    await writeFile(join(root, 'adapters', 'windows', 'src', 'aifetchly_windows', 'entrypoint.py'), '# entry\n');
  } else {
    await mkdir(join(root, 'adapters', 'macos', 'ghost-os'), { recursive: true });
    await writeFile(join(root, 'adapters', 'macos', 'ghost-os', 'upstream.lock'), JSON.stringify(lock));
    await writeFile(join(root, 'adapters', 'macos', 'ghost-os', 'tool-allowlist.json'), '{}');
  }
  return root;
}

// E10: a pin alone (status + revision) is metadata staging, not a deliverable.
// A runnable closure needs the full lock digests plus launchable sources.
const PIN_METADATA_ONLY = {
  status: 'pinned',
  component: 'windows-mcp-backend',
  upstream: 'https://github.com/CursorTouch/Windows-MCP',
  selectedRevision: 'a'.repeat(40),
  pythonVersion: '3.14.1',
};

function fullWindowsLock(uvLockBytes: string = 'lock\n'): object {
  const digest = createHash('sha256').update(uvLockBytes).digest('hex');
  return {
    status: 'pinned',
    component: 'windows-mcp-backend',
    upstream: 'https://github.com/CursorTouch/Windows-MCP',
    selectedRevision: 'b'.repeat(40),
    sourceSha256: 'c'.repeat(64),
    patchSetDigest: null,
    pythonVersion: '3.14.1',
    dependencyLockSha256: digest,
    notes: 'test pin',
  };
}

describe('package:build (CU-PLUGIN-13)', () => {
  const cleanups: string[] = [];
  afterAll(async () => {
    for (const dir of cleanups) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('refuses while the target lock is unpinned', async () => {
    const root = await tempRepoWith('win32-x64', { status: 'unpinned' });
    cleanups.push(root);
    const out = join(root, 'out');
    const result = await packageBuild(root, 'win32-x64', out);
    expect(result.outcome).toBe('missingPrerequisites');
    expect(result.message).toMatch(/pinned, verified targets|upstream-lock-v1|unpinned/i);
  });

  it('rejects unknown targets', async () => {
    const result = await packageBuild(REPO, 'linux-x64', '/tmp');
    expect(result.outcome).toBe('invalidArgs');
  });

  it('assembles a checksummed windows package from a pinned lock', async () => {
    const root = await tempRepoWith('win32-x64', fullWindowsLock());
    cleanups.push(root, join(root, 'out'));
    const result = await packageBuild(root, 'win32-x64', join(root, 'out'));
    expect(result.outcome).toBe('ok');
    const manifest = result.result as {
      target: string;
      digest: string;
      signed: boolean;
      files: { path: string; role: string; sha256: string }[];
    };
    expect(manifest.target).toBe('win32-x64');
    expect(manifest.signed).toBe(false); // signing is release evidence, not packaging (B06)
    const paths = manifest.files.map((file) => file.path);
    expect(paths).toContain('plugin/manifest.json');
    expect(paths).toContain('THIRD_PARTY_NOTICES');
    expect(paths).toContain('adapters/windows/uv.lock');
    expect(paths).toContain('adapters/windows/launch-profile.json');
    expect(paths).toContain('adapters/windows/pyproject.toml');
    // E03: every delivered backend byte is enumerated; changing src changes digest.
    expect(paths.some((p) => p.startsWith('adapters/windows/src/'))).toBe(true);
    // The written package-manifest.json matches the returned closure.
    const dir = join(root, 'out', `package-win32-x64-${'b'.repeat(10)}`);
    const onDisk = JSON.parse(await readFile(join(dir, 'package-manifest.json'), 'utf8'));
    expect(onDisk.digest).toBe(manifest.digest);
  });

  it('pinning metadata alone never reports package success (E10)', async () => {
    const root = await tempRepoWith('win32-x64', PIN_METADATA_ONLY);
    cleanups.push(root);
    const result = await packageBuild(root, 'win32-x64', join(root, 'out'));
    expect(result.outcome).toBe('missingPrerequisites');
    expect(result.message).toMatch(/full closure|sourceSha256|dependencyLockSha256|40-character/i);
  });

  it('mac packaging fails closed until the P0-E helper selection exists (E10)', async () => {
    const root = await tempRepoWith('darwin-arm64', {
      status: 'pinned',
      component: 'ghost-os-helper',
      upstream: 'https://github.com/ghostwright/ghost-os',
      selectedRevision: 'd'.repeat(40),
      sourceSha256: 'e'.repeat(64),
      dependencyLock: null,
      notes: 'test',
    });
    cleanups.push(root, join(root, 'out'));
    const result = await packageBuild(root, 'darwin-arm64', join(root, 'out'));
    // No Swift source/helper exists yet: metadata staging, not a deliverable.
    expect(['missingPrerequisites', 'failed']).toContain(result.outcome);
    expect(result.message).toMatch(/runnable backend source|helper|P0-E|P3/i);
  });

  it('fails when a pinned lock references missing environment inputs', async () => {
    const root = await tempRepoWith('win32-x64', fullWindowsLock());
    cleanups.push(root);
    await rm(join(root, 'adapters', 'windows', 'uv.lock'));
    const result = await packageBuild(root, 'win32-x64', join(root, 'out'));
    expect(['failed', 'missingPrerequisites']).toContain(result.outcome);
    expect(result.message).toMatch(/environment input missing|uv\.lock missing|cannot verify/i);
  });

  it('fails when the runnable backend source is absent even with a pin (B06)', async () => {
    const root = await tempRepoWith('win32-x64', fullWindowsLock());
    cleanups.push(root);
    await rm(join(root, 'adapters', 'windows', 'src'), { recursive: true, force: true });
    const result = await packageBuild(root, 'win32-x64', join(root, 'out'));
    expect(result.outcome).toBe('failed');
    expect(result.message).toMatch(/runnable backend source missing/);
  });

  it('rebuilding never resurrects stale files from a previous build (B07)', async () => {
    const root = await tempRepoWith('win32-x64', fullWindowsLock());
    cleanups.push(root);
    const out = join(root, 'out');
    const first = await packageBuild(root, 'win32-x64', out);
    expect(first.outcome).toBe('ok');
    const dir = (first.result as { files: { path: string }[] }).files.length;
    expect(dir).toBeGreaterThan(0);
    // Plant a stale unlisted file inside the built package, then rebuild.
    const packageDir = join(out, `package-win32-x64-${'b'.repeat(10)}`);
    await writeFile(join(packageDir, 'stale-unlisted.txt'), 'stale\n');
    const second = await packageBuild(root, 'win32-x64', out);
    expect(second.outcome).toBe('ok');
    const stale = await stat(join(packageDir, 'stale-unlisted.txt')).catch(() => undefined);
    expect(stale).toBeUndefined();
    // The package source tree survived the rebuild.
    const entry = await stat(join(packageDir, 'adapters', 'windows', 'src')).catch(() => undefined);
    expect(entry).toBeDefined();
  });
});

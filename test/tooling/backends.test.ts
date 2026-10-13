import { copyFile, mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rm } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { backendPrepare, backendTest, modelPrepare, verifyModelCache } from '../../tooling/commands/backends.js';

async function repoWithLock(relative: string, lock: object, windowsPinExtras?: object): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cu-backend-'));
  await mkdir(join(root, relative, '..'), { recursive: true });
  await writeFile(join(root, relative), JSON.stringify(lock));
  // The canonical upstream-lock schema lives under contracts/ in every repo.
  await mkdir(join(root, 'contracts', 'adapters'), { recursive: true });
  await copyFile(
    join(process.cwd(), 'contracts', 'adapters', 'upstream-lock-v1.schema.json'),
    join(root, 'contracts', 'adapters', 'upstream-lock-v1.schema.json'),
  );
  if (windowsPinExtras !== undefined) {
    // A pinned Windows lock must also carry digests matching its uv.lock.
    const uvLock = 'lock contents\n';
    await writeFile(join(root, 'adapters', 'windows', 'uv.lock'), uvLock);
    const merged = {
      ...lock,
      dependencyLockSha256: createHash('sha256').update(uvLock).digest('hex'),
      ...windowsPinExtras,
    };
    await writeFile(join(root, relative), JSON.stringify(merged));
  }
  return root;
}

describe('backend environment commands (fail closed on unpinned locks)', () => {
  it('backend:prepare refuses while the Windows lock is unpinned', async () => {
    const root = await repoWithLock('adapters/windows/upstream.lock', { status: 'unpinned', component: 'windows-mcp-backend', upstream: 'https://example/Windows-MCP' });
    const result = await backendPrepare(root, 'win32-x64');
    expect(result.outcome).toBe('missingPrerequisites');
    expect(result.message).toMatch(/P0-C\/P0-E spike must pin/);
    await rm(root, { recursive: true, force: true });
  });

  it('backend:prepare defers macOS to the P0-E/P3 decision', async () => {
    const root = await repoWithLock(join('adapters', 'macos', 'ghost-os', 'upstream.lock'), {
      status: 'pinned',
      selectedRevision: 'abc123',
      component: 'ghost-os-helper',
      upstream: 'https://example/ghost-os',
    });
    const result = await backendPrepare(root, 'darwin-arm64');
    expect(result.outcome).toBe('missingPrerequisites');
    expect(result.message).toMatch(/P3 deliverable/);
    await rm(root, { recursive: true, force: true });
  });

  it('backend:prepare rejects unknown targets', async () => {
    const result = await backendPrepare('/tmp', 'linux-x64');
    expect(result.outcome).toBe('invalidArgs');
  });

  it('native tests demand --allow-input and a pinned environment', async () => {
    const noFlag = await backendTest('/tmp', 'win32-x64', 'native', false);
    expect(noFlag.outcome).toBe('invalidArgs');
    expect(noFlag.message).toMatch(/--allow-input/);

    const root = await repoWithLock('adapters/windows/upstream.lock', { status: 'unpinned', component: 'windows-mcp-backend', upstream: 'https://example/Windows-MCP' });
    const unpinned = await backendTest(root, 'win32-x64', 'native', true);
    expect(unpinned.outcome).toBe('missingPrerequisites');
    expect(unpinned.message).toMatch(/pinned Windows environment/);
    await rm(root, { recursive: true, force: true });
  });

  it('a pinned windows lock without closure digests fails preparation (M02)', async () => {
    const root = await repoWithLock('adapters/windows/upstream.lock', {
      status: 'pinned', selectedRevision: 'abc123', pythonVersion: '3.14.4',
      component: 'windows-mcp-backend', upstream: 'https://example/Windows-MCP',
    });
    const result = await backendPrepare(root, 'win32-x64');
    expect(result.outcome).toBe('missingPrerequisites');
    expect(result.message).toMatch(/lacks sourceSha256\/dependencyLockSha256/);
  });

  it('a pinned windows lock whose uv.lock digest disagrees fails preparation (M02)', async () => {
    const root = await repoWithLock(
      'adapters/windows/upstream.lock',
      { status: 'pinned', selectedRevision: 'abc123', pythonVersion: '3.14.4',
        component: 'windows-mcp-backend', upstream: 'https://example/Windows-MCP' },
      { sourceSha256: 'b'.repeat(64), dependencyLockSha256: '0'.repeat(64),
        component: 'windows-mcp-backend', upstream: 'https://example/Windows-MCP' },
    );
    const result = await backendPrepare(root, 'win32-x64');
    expect(result.outcome).toBe('missingPrerequisites');
    expect(result.message).toMatch(/dependencyLockSha256 does not match/);
  });

  it('model:prepare refuses while models.lock.json is not approved', async () => {
    const root = await repoWithLock('grounding/models.lock.json', { status: 'unfetched' });
    const result = await modelPrepare(root, 'gui-actor-2b-fp16');
    expect(result.outcome).toBe('missingPrerequisites');
    expect(result.message).toMatch(/P0-D spike must pin/);
    await rm(root, { recursive: true, force: true });
  });

  it('model:prepare verifies the cache against an approved lock and never downloads (M04)', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cu-model-'));
    const cache = join(root, 'cache');
    await mkdir(cache, { recursive: true });
    await mkdir(join(root, 'grounding'), { recursive: true });
    const good = Buffer.from('weights-part-a');
    const wrong = Buffer.from('tampered');
    await writeFile(join(cache, 'model-00001-of-00002.safetensors'), good);
    await writeFile(join(cache, 'model-00002-of-00002.safetensors'), wrong);
    await writeFile(join(root, 'grounding', 'models.lock.json'), JSON.stringify({
      status: 'approved',
      models: [{ modelId: 'microsoft/GUI-Actor-2B-Qwen2-VL', revision: 'a'.repeat(40), commercialUse: 'allowed', status: 'approved',
        weightsFiles: [
          { path: 'model-00001-of-00002.safetensors', sha256: createHash('sha256').update(good).digest('hex'), bytes: good.length },
          { path: 'model-00002-of-00002.safetensors', sha256: createHash('sha256').update(Buffer.from('weights-part-b')).digest('hex'), bytes: 14 },
          { path: 'model-00003-of-00002.safetensors', sha256: 'c'.repeat(64), bytes: 8 },
        ] }],
    }));
    const verification = await verifyModelCache(root, 'microsoft/GUI-Actor-2B-Qwen2-VL', cache);
    expect(verification.present).toEqual(['model-00001-of-00002.safetensors']);
    expect(verification.missing).toEqual(['model-00003-of-00002.safetensors']);
    expect(verification.hashMismatches).toEqual(['model-00002-of-00002.safetensors']);
    const result = await modelPrepare(root, 'microsoft/GUI-Actor-2B-Qwen2-VL', cache);
    expect(result.outcome).toBe('missingPrerequisites');
    expect(result.message).toMatch(/never downloads/);
    await rm(root, { recursive: true, force: true });
  });

  it('model:prepare succeeds when every pinned file is present and correct (M04)', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cu-model-ok-'));
    const cache = join(root, 'cache');
    await mkdir(cache, { recursive: true });
    await mkdir(join(root, 'grounding'), { recursive: true });
    const part = Buffer.from('weights');
    await writeFile(join(cache, 'only.safetensors'), part);
    await writeFile(join(root, 'grounding', 'models.lock.json'), JSON.stringify({
      status: 'approved',
      models: [{ modelId: 'm', revision: 'b'.repeat(40), commercialUse: 'allowed', status: 'approved',
        weightsFiles: [{ path: 'only.safetensors', sha256: createHash('sha256').update(part).digest('hex'), bytes: part.length }] }],
    }));
    const result = await modelPrepare(root, 'm', cache);
    expect(result.outcome).toBe('ok');
    expect(result.message).toMatch(/present: 1\/1/);
    await rm(root, { recursive: true, force: true });
  });

  it('model:prepare rejects unknown configs, missing revisions/digests and blocked models (B13)', async () => {
    async function lockRoot(lock: object): Promise<string> {      const root = await mkdtemp(join(tmpdir(), 'cu-model-b13-'));
      await mkdir(join(root, 'grounding'), { recursive: true });
      await writeFile(join(root, 'grounding', 'models.lock.json'), JSON.stringify(lock));
      return root;
    }
    // Unknown config.
    let root = await lockRoot({
      status: 'approved',
      models: [{ modelId: 'm', revision: 'a'.repeat(40), commercialUse: 'allowed', status: 'approved', weightsFiles: [{ path: 'a.bin', sha256: 'a'.repeat(64), bytes: 1 }] }],
    });
    let result = await modelPrepare(root, 'nonexistent-config', join(root, 'cache'));
    expect(result.outcome).toBe('missingPrerequisites');
    expect(result.message).toMatch(/unknown model configuration/);
    await rm(root, { recursive: true, force: true });
    // Missing revision.
    root = await lockRoot({
      status: 'approved',
      models: [{ modelId: 'm', revision: null, commercialUse: 'allowed', status: 'approved', weightsFiles: [{ path: 'a.bin', sha256: 'a'.repeat(64), bytes: 1 }] }],
    });
    result = await modelPrepare(root, 'm', join(root, 'cache'));
    expect(result.outcome).toBe('missingPrerequisites');
    expect(result.message).toMatch(/no pinned revision/);
    await rm(root, { recursive: true, force: true });
    // Missing digest / wrong size shape.
    root = await lockRoot({
      status: 'approved',
      models: [{ modelId: 'm', revision: 'a'.repeat(40), commercialUse: 'allowed', status: 'approved', weightsFiles: [{ path: 'a.bin', bytes: 999 }] }],
    });
    result = await modelPrepare(root, 'm', join(root, 'cache'));
    expect(result.outcome).toBe('missingPrerequisites');
    expect(result.message).toMatch(/lacks a pinned .*SHA/);
    await rm(root, { recursive: true, force: true });
    // Blocked model.
    root = await lockRoot({
      status: 'approved',
      models: [{ modelId: 'm', revision: 'a'.repeat(40), commercialUse: 'blocked', status: 'blocked-pending-commercial-licence', weightsFiles: [{ path: 'a.bin', sha256: 'a'.repeat(64), bytes: 1 }] }],
    });
    result = await modelPrepare(root, 'm', join(root, 'cache'));
    expect(result.outcome).toBe('missingPrerequisites');
    expect(result.message).toMatch(/blocked/);
    await rm(root, { recursive: true, force: true });
    // Duplicate path.
    root = await lockRoot({
      status: 'approved',
      models: [{ modelId: 'm', revision: 'a'.repeat(40), commercialUse: 'allowed', status: 'approved', weightsFiles: [
        { path: 'a.bin', sha256: 'a'.repeat(64), bytes: 1 },
        { path: 'a.bin', sha256: 'b'.repeat(64), bytes: 1 },
      ] }],
    });
    result = await modelPrepare(root, 'm', join(root, 'cache'));
    expect(result.outcome).toBe('missingPrerequisites');
    expect(result.message).toMatch(/duplicate/);
    await rm(root, { recursive: true, force: true });
    // Escaping path.
    root = await lockRoot({
      status: 'approved',
      models: [{ modelId: 'm', revision: 'a'.repeat(40), commercialUse: 'allowed', status: 'approved', weightsFiles: [{ path: '../evil.bin', sha256: 'a'.repeat(64), bytes: 1 }] }],
    });
    result = await modelPrepare(root, 'm', join(root, 'cache'));
    expect(result.outcome).toBe('missingPrerequisites');
    expect(result.message).toMatch(/escapes/);
    await rm(root, { recursive: true, force: true });
    // Traversal config never probes the filesystem — unknown, not a read.
    root = await lockRoot({
      status: 'approved',
      models: [{ modelId: 'm', revision: 'a'.repeat(40), commercialUse: 'allowed', status: 'approved', weightsFiles: [{ path: 'a.bin', sha256: 'a'.repeat(64), bytes: 1 }] }],
    });
    result = await modelPrepare(root, '../../elsewhere/x', join(root, 'cache'));
    expect(result.outcome).toBe('missingPrerequisites');
    expect(result.message).toMatch(/unknown model configuration/);
    await rm(root, { recursive: true, force: true });
    // N09: floating revision.
    root = await lockRoot({
      status: 'approved',
      models: [{ modelId: 'm', revision: 'main', commercialUse: 'allowed', status: 'approved', weightsFiles: [{ path: 'a.bin', sha256: 'a'.repeat(64), bytes: 1 }] }],
    });
    result = await modelPrepare(root, 'm', join(root, 'cache'));
    expect(result.outcome).toBe('missingPrerequisites');
    expect(result.message).toMatch(/not immutable/);
    await rm(root, { recursive: true, force: true });
    // N09: not-qualified status.
    root = await lockRoot({
      status: 'approved',
      models: [{ modelId: 'm', revision: 'a'.repeat(40), commercialUse: 'allowed', status: 'not-qualified', weightsFiles: [{ path: 'a.bin', sha256: 'a'.repeat(64), bytes: 1 }] }],
    });
    result = await modelPrepare(root, 'm', join(root, 'cache'));
    expect(result.outcome).toBe('missingPrerequisites');
    expect(result.message).toMatch(/not an approved preparation state/);
    await rm(root, { recursive: true, force: true });
    // N09: unknown licence state.
    root = await lockRoot({
      status: 'approved',
      models: [{ modelId: 'm', revision: 'a'.repeat(40), commercialUse: 'unknown', status: 'approved', weightsFiles: [{ path: 'a.bin', sha256: 'a'.repeat(64), bytes: 1 }] }],
    });
    result = await modelPrepare(root, 'm', join(root, 'cache'));
    expect(result.outcome).toBe('missingPrerequisites');
    expect(result.message).toMatch(/not an approved licence state/);
    await rm(root, { recursive: true, force: true });
    // N09: duplicate model identity.
    root = await lockRoot({
      status: 'approved',
      models: [
        { modelId: 'm', revision: 'a'.repeat(40), commercialUse: 'allowed', status: 'approved', weightsFiles: [{ path: 'a.bin', sha256: 'a'.repeat(64), bytes: 1 }] },
        { modelId: 'm', revision: 'b'.repeat(40), commercialUse: 'allowed', status: 'approved', weightsFiles: [{ path: 'b.bin', sha256: 'b'.repeat(64), bytes: 1 }] },
      ],
    });
    result = await modelPrepare(root, 'm', join(root, 'cache'));
    expect(result.outcome).toBe('missingPrerequisites');
    expect(result.message).toMatch(/Ambiguous identity|ambiguous identity/);
    await rm(root, { recursive: true, force: true });
  });

  it('N09: outside cache symlinks never satisfy preparation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cu-model-link-'));
    const cache = join(root, 'cache');
    const outside = join(root, 'outside');
    await mkdir(cache, { recursive: true });
    await mkdir(outside, { recursive: true });
    await mkdir(join(root, 'grounding'), { recursive: true });
    const secret = Buffer.from('external-bytes-1234');
    await writeFile(join(outside, 'real.bin'), secret);
    const { symlink } = await import('node:fs/promises');
    await symlink(join(outside, 'real.bin'), join(cache, 'weights.bin'));
    await writeFile(join(root, 'grounding', 'models.lock.json'), JSON.stringify({
      status: 'approved',
      models: [{ modelId: 'm', revision: 'a'.repeat(40), commercialUse: 'allowed', status: 'approved',
        weightsFiles: [{ path: 'weights.bin', sha256: createHash('sha256').update(secret).digest('hex'), bytes: secret.length }] }],
    }));
    const result = await modelPrepare(root, 'm', cache);
    expect(result.outcome).toBe('missingPrerequisites');
    await rm(root, { recursive: true, force: true });
  });
});

import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rm } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { backendPrepare, backendTest, modelPrepare } from '../../tooling/commands/backends.js';

async function repoWithLock(relative: string, lock: object): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cu-backend-'));
  await mkdir(join(root, relative, '..'), { recursive: true });
  await writeFile(join(root, relative), JSON.stringify(lock));
  return root;
}

describe('backend environment commands (fail closed on unpinned locks)', () => {
  it('backend:prepare refuses while the Windows lock is unpinned', async () => {
    const root = await repoWithLock('adapters/windows/upstream.lock', { status: 'unpinned' });
    const result = await backendPrepare(root, 'win32-x64');
    expect(result.outcome).toBe('missingPrerequisites');
    expect(result.message).toMatch(/P0-C\/P0-E spike must pin/);
    await rm(root, { recursive: true, force: true });
  });

  it('backend:prepare defers macOS to the P0-E/P3 decision', async () => {
    const root = await repoWithLock(join('adapters', 'macos', 'ghost-os', 'upstream.lock'), {
      status: 'pinned',
      selectedRevision: 'abc123',
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

    const root = await repoWithLock('adapters/windows/upstream.lock', { status: 'unpinned' });
    const unpinned = await backendTest(root, 'win32-x64', 'native', true);
    expect(unpinned.outcome).toBe('missingPrerequisites');
    expect(unpinned.message).toMatch(/pinned Windows environment/);
    await rm(root, { recursive: true, force: true });
  });

  it('model:prepare refuses while models.lock.json is not approved', async () => {
    const root = await repoWithLock('grounding/models.lock.json', { status: 'unfetched' });
    const result = await modelPrepare(root, 'gui-actor-2b-fp16');
    expect(result.outcome).toBe('missingPrerequisites');
    expect(result.message).toMatch(/P0-D spike must pin/);
    await rm(root, { recursive: true, force: true });
  });
});

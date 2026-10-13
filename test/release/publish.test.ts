import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { publishStaging, stagingFor, type PublishOps } from '../../tooling/release/publish.js';

async function layout(): Promise<{ root: string; finalDir: string; staging: string }> {
  const root = await mkdtemp(join(tmpdir(), 'cu-pub-'));
  const finalDir = join(root, 'final');
  await mkdir(finalDir, { recursive: true });
  await writeFile(join(finalDir, 'keep.txt'), 'previous-bytes');
  const staging = stagingFor(finalDir);
  await mkdir(staging, { recursive: true });
  await writeFile(join(staging, 'keep.txt'), 'new-bytes');
  return { root, finalDir, staging };
}

describe('publishStaging (N08)', () => {
  it('publishes staging over a previous candidate and drops the backup', async () => {
    const { root, finalDir, staging } = await layout();
    const result = await publishStaging(staging, finalDir);
    expect(result.outcome).toBe('ok');
    expect(await readFile(join(finalDir, 'keep.txt'), 'utf8')).toBe('new-bytes');
    const { readdir } = await import('node:fs/promises');
    expect((await readdir(root)).filter((e) => e.includes('backup'))).toEqual([]);
    await rm(root, { recursive: true, force: true });
  });

  it('publishes when no previous candidate exists', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cu-pub-fresh-'));
    const finalDir = join(root, 'final');
    const staging = stagingFor(finalDir);
    await mkdir(staging, { recursive: true });
    await writeFile(join(staging, 'keep.txt'), 'new-bytes');
    const result = await publishStaging(staging, finalDir);
    expect(result.outcome).toBe('ok');
    expect(await readFile(join(finalDir, 'keep.txt'), 'utf8')).toBe('new-bytes');
    await rm(root, { recursive: true, force: true });
  });

  it('a failed final rename restores the previous candidate and retains staging', async () => {
    const { root, finalDir, staging } = await layout();
    const realOps = (await import('../../tooling/release/publish.js')).defaultPublishOps;
    const ops: PublishOps = {
      ...realOps,
      rename: (from, to) => {
        if (from === staging) {
          return Promise.reject(new Error('EIO: injected final-rename failure'));
        }
        return realOps.rename(from, to);
      },
    };
    const result = await publishStaging(staging, finalDir, ops);
    expect(result.outcome).toBe('failed');
    // Previous complete directory preserved byte-identical.
    expect(await readFile(join(finalDir, 'keep.txt'), 'utf8')).toBe('previous-bytes');
    // Staging retained for inspection.
    expect(await readFile(join(staging, 'keep.txt'), 'utf8')).toBe('new-bytes');
    await rm(root, { recursive: true, force: true });
  });

  it('a failed backup rename leaves the previous candidate untouched', async () => {
    const { root, finalDir, staging } = await layout();
    const realOps = (await import('../../tooling/release/publish.js')).defaultPublishOps;
    const ops: PublishOps = {
      ...realOps,
      rename: (from) => {
        if (from === finalDir) {
          return Promise.reject(new Error('EIO: injected backup failure'));
        }
        return realOps.rename(from, join(finalDir, 'should-never-appear'));
      },
    };
    const result = await publishStaging(staging, finalDir, ops);
    expect(result.outcome).toBe('failed');
    expect(await readFile(join(finalDir, 'keep.txt'), 'utf8')).toBe('previous-bytes');
    await rm(root, { recursive: true, force: true });
  });

  it('staging directories are unique per call', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cu-pub-uniq-'));
    const finalDir = join(root, 'final');
    expect(stagingFor(finalDir)).not.toBe(stagingFor(finalDir));
    await rm(root, { recursive: true, force: true });
  });

  it('a failed restore reports the surviving backup location honestly', async () => {
    const { root, finalDir, staging } = await layout();
    const realOps = (await import('../../tooling/release/publish.js')).defaultPublishOps;
    const ops: PublishOps = {
      ...realOps,
      rename: (from, to) => {
        if (from === staging) {
          return Promise.reject(new Error('EIO: injected final-rename failure'));
        }
        if (from !== finalDir) {
          // The backup→final restore path.
          return Promise.reject(new Error('EIO: injected restore failure'));
        }
        return realOps.rename(from, to);
      },
    };
    const result = await publishStaging(staging, finalDir, ops);
    expect(result.outcome).toBe('failed');
    if (result.outcome !== 'failed') {
      throw new Error('expected publish failure');
    }
    // Must not claim a restore that never happened.
    expect(result.message).toMatch(/restore also failed/);
    expect(result.message).toMatch(/survives at/);
    await rm(root, { recursive: true, force: true });
  });
});

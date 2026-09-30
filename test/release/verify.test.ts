import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sha256Directory, sha256File } from '../../tooling/release/hash.js';
import { verifyRelease } from '../../tooling/release/verify.js';

const REPO = process.cwd();
const SCHEMA = join(REPO, 'tooling', 'release', 'schemas', 'release-manifest-v1.schema.json');
const FIXTURES = join(REPO, 'test', 'fixtures', 'release');

function b(content: string): Buffer {
  return Buffer.from(content, 'utf8');
}

describe('hash helpers', () => {
  it('sha256File matches known vectors', async () => {
    const temp = await mkdtemp(join(tmpdir(), 'cu-hash-'));
    const path = join(temp, 'abc.txt');
    await writeFile(path, 'abc');
    // RFC 6234 test vector for 'abc'
    expect(await sha256File(path)).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    await rm(temp, { recursive: true, force: true });
  });

  it('sha256Directory is deterministic across file creation orderings', async () => {
    async function makeDir(order: 'a-first' | 'b-first'): Promise<string> {
      const dir = await mkdtemp(join(tmpdir(), `cu-dir-${order}-`));
      const writes: [string, string][] = [
        [join(dir, 'z.txt'), 'zebra'],
        [join(dir, 'a.txt'), 'alpha'],
        [join(dir, 'nested', 'm.txt'), 'middle'],
      ];
      const sorted = order === 'a-first' ? writes : [...writes].reverse();
      for (const [path, content] of sorted) {
        await mkdir(join(path, '..'), { recursive: true });
        await writeFile(path, content);
      }
      return dir;
    }
    const first = await makeDir('a-first');
    const second = await makeDir('b-first');
    expect(await sha256Directory(first)).toBe(await sha256Directory(second));
    expect(await sha256Directory(first)).toBe(
      createHash('sha256')
        .update(
          [
            `a.txt:${createHash('sha256').update('alpha').digest('hex')}`,
            `nested/m.txt:${createHash('sha256').update('middle').digest('hex')}`,
            `z.txt:${createHash('sha256').update('zebra').digest('hex')}`,
          ].join('\n'),
        )
        .digest('hex'),
    );
    await rm(first, { recursive: true, force: true });
    await rm(second, { recursive: true, force: true });
  });
});

describe('verifyRelease gates (CU-PLUGIN-21, CU-INST-11)', () => {
  it('good closure verifies clean', async () => {
    const report = await verifyRelease(join(FIXTURES, 'good', 'release.json'), SCHEMA);
    expect(report.failures).toEqual([]);
    expect(report.artifactCount).toBe(6);
  });

  it('missing required evidence suite fails and names the gate', async () => {
    const report = await verifyRelease(join(FIXTURES, 'missing-evidence', 'release.json'), SCHEMA);
    expect(report.failures.length).toBeGreaterThan(0);
    expect(report.failures.some((f) => f.gate === 'evidence' && /parity/.test(f.detail))).toBe(true);
  });

  it('wrong platform on a platform-bound role fails', async () => {
    const report = await verifyRelease(join(FIXTURES, 'wrong-platform', 'release.json'), SCHEMA);
    expect(report.failures.some((f) => f.gate === 'platform' && /windows-env/.test(f.detail))).toBe(true);
  });

  it('hash mismatch fails closure', async () => {
    const report = await verifyRelease(join(FIXTURES, 'bad-hash', 'release.json'), SCHEMA);
    expect(report.failures.some((f) => f.gate === 'hash')).toBe(true);
  });

  it('non-commercial licence chain blocks the release (CU-INST-11)', async () => {
    const report = await verifyRelease(join(FIXTURES, 'noncommercial', 'release.json'), SCHEMA);
    expect(report.failures.some((f) => f.gate === 'licence' && /non-commercial/.test(f.detail))).toBe(true);
  });

  it('sibling-prefix path escape is rejected (E-3 regression)', async () => {
    const report = await verifyRelease(join(FIXTURES, 'path-escape', 'release.json'), SCHEMA);
    expect(report.failures.some((f) => f.gate === 'closure' && /escapes the release directory/.test(f.detail))).toBe(true);
  });

  it('absolute artifact locations are rejected (E-3 regression)', async () => {
    const temp = await mkdtemp(join(tmpdir(), 'cu-rel-2-'));
    const goodBytes = b('ok');
    await writeFile(join(temp, 'a.bin'), goodBytes);
    const manifest = {
      schemaVersion: 1,
      releaseVersion: '0.1.0-rc.abs',
      sourceCommit: 'abc1234',
      contractArchive: { version: 'v1', sha256: 'f'.repeat(64) },
      requiredEvidence: [],
      artifacts: [
        { role: 'contracts', location: '/etc/hostname', bytes: 1, sha256: 'a'.repeat(64) },
      ],
    };
    const path = join(temp, 'release.json');
    await writeFile(path, JSON.stringify(manifest));
    const report = await verifyRelease(path, SCHEMA);
    expect(report.failures.some((f) => f.gate === 'closure' && /escapes/.test(f.detail))).toBe(true);
    await rm(temp, { recursive: true, force: true });
  });

  it('missing base-model licence fails the licence gate (E-4 regression)', async () => {
    const report = await verifyRelease(join(FIXTURES, 'missing-basemodel', 'release.json'), SCHEMA);
    expect(
      report.failures.some((f) => f.gate === 'licence' && /baseModel\.licence/.test(f.detail)),
    ).toBe(true);
  });

  it('malformed manifest fails at the schema gate with zero artifacts', async () => {
    const temp = await mkdtemp(join(tmpdir(), 'cu-rel-'));
    const bad = join(temp, 'release.json');
    await writeFile(bad, JSON.stringify({ schemaVersion: 99 }));
    const report = await verifyRelease(bad, SCHEMA);
    expect(report.failures[0]?.gate).toBe('schema');
    expect(report.artifactCount).toBe(0);
    await rm(temp, { recursive: true, force: true });
  });
});

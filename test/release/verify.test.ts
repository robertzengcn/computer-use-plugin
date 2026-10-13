import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm, readFile, cp } from 'node:fs/promises';
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
    expect(report.artifactCount).toBe(11);
    // N02: synthetic candidate fixtures validate as tooling candidates —
    // explicitly not publication eligibility.
    expect(report.qualification).toBe('candidate');
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
      report.failures.some((f) => f.gate === 'licence' && /baseModel/.test(f.detail)),
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

  it('a failed/skipped/empty evidence report fails the gate (B03 regression)', async () => {
    const report = await verifyRelease(join(FIXTURES, 'failed-evidence', 'release.json'), SCHEMA);
    const details = report.failures.map((f) => f.detail).join('\n');
    expect(report.failures.some((f) => f.gate === 'evidence')).toBe(true);
    expect(details).toMatch(/executed 0 cases/);
    expect(details).toMatch(/9 failed cases/);
    expect(details).toMatch(/9 skipped cases/);
  });

  it('evidenceRequired artifacts with an empty requiredEvidence list fail (B03)', async () => {
    const report = await verifyRelease(join(FIXTURES, 'empty-required-evidence', 'release.json'), SCHEMA);
    expect(
      report.failures.some((f) => f.gate === 'evidence' && /empty requiredEvidence/.test(f.detail)),
    ).toBe(true);
  });

  it('a contractArchive digest that disagrees with the shipped artifact fails (B04)', async () => {
    const temp = await mkdtemp(join(tmpdir(), 'cu-rel-3-'));
    const bytes = b('contracts-bytes');
    await writeFile(join(temp, 'contracts.zip'), bytes);
    const manifest = {
      schemaVersion: 1,
      releaseVersion: '0.1.0-rc.cd',
      sourceCommit: 'abc1234',
      contractArchive: { version: 'v1', sha256: '0'.repeat(64) },
      requiredEvidence: [],
      artifacts: [
        { role: 'contracts', location: 'contracts.zip', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), compatibleWith: { hostAppRange: '>=0.1.0' } },
      ],
    };
    const path = join(temp, 'release.json');
    await writeFile(path, JSON.stringify(manifest));
    const report = await verifyRelease(path, SCHEMA);
    expect(
      report.failures.some((f) => f.gate === 'compatibility' && /contractArchive\.sha256/.test(f.detail)),
    ).toBe(true);
    await rm(temp, { recursive: true, force: true });
  });
});

async function copyGoodFixture(): Promise<string> {
  const temp = await mkdtemp(join(tmpdir(), 'cu-mut-'));
  await cp(join(FIXTURES, 'good'), temp, { recursive: true });
  return temp;
}

async function rehashArtifact(dir: string, location: string): Promise<void> {
  const manifestPath = join(dir, 'release.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
    artifacts: { location: string; bytes: number; sha256: string; role?: string }[];
    contractArchive: { sha256: string };
  };
  const bytes = await readFile(join(dir, location));
  const entry = manifest.artifacts.find((a) => a.location === location);
  if (entry !== undefined) {
    entry.bytes = bytes.length;
    entry.sha256 = createHash('sha256').update(bytes).digest('hex');
  }
  if (location === 'contracts.zip') {
    manifest.contractArchive.sha256 = createHash('sha256').update(bytes).digest('hex');
    // plugin artifact shares the same bytes in this fixture
    const plugin = manifest.artifacts.find((a) => a.role === 'plugin');
    if (plugin !== undefined && plugin.location === location) {
      plugin.bytes = bytes.length;
      plugin.sha256 = createHash('sha256').update(bytes).digest('hex');
    }
  }
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
}

/** Point the windows-env artifact at a nested package record. */
async function repointWindowsEnvToPackage(
  dir: string,
  manifestFileName: string,
  manifestObj: unknown,
  extraFiles: Record<string, string> = {},
): Promise<void> {
  const pkgDir = join(dir, 'pkg');
  await mkdir(pkgDir, { recursive: true });
  await writeFile(join(pkgDir, manifestFileName), JSON.stringify(manifestObj));
  for (const [name, content] of Object.entries(extraFiles)) {
    await writeFile(join(pkgDir, name), content);
  }
  const manifestPath = join(dir, 'release.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
    artifacts: { role: string; location: string; bytes: number; sha256: string; launchProfile?: string }[];
  };
  const win = manifest.artifacts.find((a) => a.role === 'windows-env')!;
  const bytes = await readFile(join(pkgDir, manifestFileName));
  win.location = `pkg/${manifestFileName}`;
  win.bytes = bytes.length;
  win.sha256 = createHash('sha256').update(bytes).digest('hex');
  delete win.launchProfile;
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
}

describe('B05–B09 mutation gates (2026-10-10 audit)', () => {
  it('N01: minimal status rows without case/run/configuration identity fail', async () => {
    const dir = await copyGoodFixture();
    await writeFile(join(dir, 'report-host-consumer.json'), JSON.stringify({
      schema: 'computer-use-host-report-v1',
      cases: [{ status: 'pass' }],
      aggregate: { planned: 1, executed: 1, passed: 1, failed: 0, skipped: 0 },
      qualification: { missingEvidence: [] },
    }));
    await rehashArtifact(dir, 'report-host-consumer.json');
    const report = await verifyRelease(join(dir, 'release.json'), SCHEMA);
    const details = report.failures.map((f) => f.detail).join('\n');
    expect(details).toMatch(/lacks run identity/);
    expect(details).toMatch(/lacks configuration identity/);
    expect(details).toMatch(/lacks a non-empty string caseId/);
    await rm(dir, { recursive: true, force: true });
  });
  it('B05: empty evidence with missing counters fails', async () => {
    const dir = await copyGoodFixture();
    await writeFile(join(dir, 'report-windows-native.json'), JSON.stringify({
      schema: 'anything', aggregate: {}, qualification: { missingEvidence: [] },
    }));
    await rehashArtifact(dir, 'report-windows-native.json');
    const report = await verifyRelease(join(dir, 'release.json'), SCHEMA);
    // Counter diagnostics AND counter-independent diagnostics are reported.
    expect(report.failures.some((f) => f.gate === 'evidence' && /aggregate\.planned/.test(f.detail))).toBe(true);
    expect(report.failures.some((f) => f.gate === 'evidence' && /lacks run identity/.test(f.detail))).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });

  it('B05: skipped case with aggregate skipped=0 fails', async () => {
    const dir = await copyGoodFixture();
    const raw = JSON.parse(await readFile(join(dir, 'report-windows-native.json'), 'utf8')) as {
      cases: { status: string }[]; aggregate: Record<string, number>;
    };
    raw.cases[0]!.status = 'skipped';
    await writeFile(join(dir, 'report-windows-native.json'), JSON.stringify(raw));
    await rehashArtifact(dir, 'report-windows-native.json');
    const report = await verifyRelease(join(dir, 'release.json'), SCHEMA);
    const details = report.failures.map((f) => f.detail).join('\n');
    expect(details).toMatch(/skipped/);
    await rm(dir, { recursive: true, force: true });
  });

  it('B05: duplicate caseId fails', async () => {
    const dir = await copyGoodFixture();
    const raw = JSON.parse(await readFile(join(dir, 'report-parity.json'), 'utf8')) as {
      cases: object[]; aggregate: Record<string, number>;
    };
    raw.cases.push({ ...raw.cases[0] });
    raw.aggregate.planned = 2;
    raw.aggregate.executed = 2;
    raw.aggregate.passed = 2;
    await writeFile(join(dir, 'report-parity.json'), JSON.stringify(raw));
    await rehashArtifact(dir, 'report-parity.json');
    // Fix the parity digest binding so only the duplicate gate fires.
    const modelRaw = JSON.parse(await readFile(join(dir, 'model-manifest.json'), 'utf8')) as {
      parityReport: { sha256: string; fixtureCount: number };
    };
    modelRaw.parityReport.fixtureCount = 2;
    const reportBytes = await readFile(join(dir, 'report-parity.json'));
    modelRaw.parityReport.sha256 = createHash('sha256').update(reportBytes).digest('hex');
    await writeFile(join(dir, 'model-manifest.json'), JSON.stringify(modelRaw, null, 2));
    await rehashArtifact(dir, 'model-manifest.json');
    const report = await verifyRelease(join(dir, 'release.json'), SCHEMA);
    expect(report.failures.some((f) => /duplicate caseId/.test(f.detail))).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });

  it('B06: unrelated native schema fails', async () => {
    const dir = await copyGoodFixture();
    const raw = JSON.parse(await readFile(join(dir, 'report-windows-native.json'), 'utf8')) as Record<string, unknown>;
    raw.schema = 'unrelated-schema';
    (raw.run as Record<string, unknown>).runnerKind = 'synthetic';
    await writeFile(join(dir, 'report-windows-native.json'), JSON.stringify(raw));
    await rehashArtifact(dir, 'report-windows-native.json');
    const report = await verifyRelease(join(dir, 'release.json'), SCHEMA);
    expect(report.failures.some((f) => /requires a computer-use-native-report-v1/.test(f.detail))).toBe(true);
    expect(report.failures.some((f) => /cannot be satisfied by synthetic/.test(f.detail))).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });

  it('B06: parity digest mismatch fails', async () => {
    const dir = await copyGoodFixture();
    const modelRaw = JSON.parse(await readFile(join(dir, 'model-manifest.json'), 'utf8')) as {
      parityReport: { sha256: string };
    };
    modelRaw.parityReport.sha256 = '1'.repeat(64);
    await writeFile(join(dir, 'model-manifest.json'), JSON.stringify(modelRaw, null, 2));
    await rehashArtifact(dir, 'model-manifest.json');
    const report = await verifyRelease(join(dir, 'release.json'), SCHEMA);
    expect(report.failures.some((f) => /no parity evidence bound to this model's parity digest/.test(f.detail))).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });

  it('B06: native configuration mismatch fails', async () => {
    const dir = await copyGoodFixture();
    const raw = JSON.parse(await readFile(join(dir, 'report-windows-native.json'), 'utf8')) as {
      configuration: { modelConfigurationId: string };
    };
    raw.configuration.modelConfigurationId = 'unrelated-config@9.9.9';
    await writeFile(join(dir, 'report-windows-native.json'), JSON.stringify(raw));
    await rehashArtifact(dir, 'report-windows-native.json');
    const report = await verifyRelease(join(dir, 'release.json'), SCHEMA);
    expect(report.failures.some((f) => /matches no bound parity configuration/.test(f.detail))).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });

  it('B07: invalid semver range and unsupported adapter fail', async () => {
    const dir = await copyGoodFixture();
    const manifest = JSON.parse(await readFile(join(dir, 'release.json'), 'utf8')) as {
      artifacts: { role: string; compatibleWith?: Record<string, string> }[];
    };
    const win = manifest.artifacts.find((a) => a.role === 'windows-env')!;
    win.compatibleWith = { hostAppRange: 'not-a-semver-range', adapterId: 'unsupported-adapter' };
    await writeFile(join(dir, 'release.json'), JSON.stringify(manifest, null, 2));
    const report = await verifyRelease(join(dir, 'release.json'), SCHEMA);
    expect(report.failures.some((f) => f.gate === 'compatibility' && /not a supported semver range/.test(f.detail))).toBe(true);
    expect(report.failures.some((f) => f.gate === 'compatibility' && /not a supported adapter/.test(f.detail))).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });

  it('N03: malformed ranges fail, hyphen ranges and prereleases pass', async () => {
    const dir = await copyGoodFixture();
    const manifest = JSON.parse(await readFile(join(dir, 'release.json'), 'utf8')) as {
      artifacts: { role: string; compatibleWith?: Record<string, string> }[];
    };
    const win = manifest.artifacts.find((a) => a.role === 'windows-env')!;
    // Malformed: double-dot version never parses.
    win.compatibleWith = { hostAppRange: '1..2' };
    await writeFile(join(dir, 'release.json'), JSON.stringify(manifest, null, 2));
    let report = await verifyRelease(join(dir, 'release.json'), SCHEMA);
    expect(report.failures.some((f) => f.gate === 'compatibility' && /not a supported semver range/.test(f.detail))).toBe(true);
    // Valid hyphen range within the supported major admits the tuple.
    win.compatibleWith = { hostAppRange: '0.1.0 - 0.2.0' };
    await writeFile(join(dir, 'release.json'), JSON.stringify(manifest, null, 2));
    report = await verifyRelease(join(dir, 'release.json'), SCHEMA);
    expect(report.failures.some((f) => f.gate === 'compatibility' && /hostAppRange/.test(f.detail))).toBe(false);
    // Impossible host major for this plugin line fails as unsupported.
    win.compatibleWith = { hostAppRange: '>=999.0.0' };
    await writeFile(join(dir, 'release.json'), JSON.stringify(manifest, null, 2));
    report = await verifyRelease(join(dir, 'release.json'), SCHEMA);
    expect(report.failures.some((f) => f.gate === 'compatibility' && /unsupported tuple/.test(f.detail))).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });

  it('N03: unsatisfiable ranges fail even when well-formed', async () => {
    const dir = await copyGoodFixture();
    const manifest = JSON.parse(await readFile(join(dir, 'release.json'), 'utf8')) as {
      artifacts: { role: string; compatibleWith?: Record<string, string> }[];
    };
    manifest.artifacts.find((a) => a.role === 'windows-env')!.compatibleWith = { hostAppRange: '>=2.0.0 <1.0.0' };
    await writeFile(join(dir, 'release.json'), JSON.stringify(manifest, null, 2));
    const report = await verifyRelease(join(dir, 'release.json'), SCHEMA);
    expect(report.failures.some((f) => f.gate === 'compatibility' && /not a supported semver range/.test(f.detail))).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });

  it('N03: model tuple disagreeing with the delivered manifest fails', async () => {
    const dir = await copyGoodFixture();
    const manifest = JSON.parse(await readFile(join(dir, 'release.json'), 'utf8')) as {
      artifacts: { role: string; compatibleWith?: Record<string, string> }[];
    };
    manifest.artifacts.find((a) => a.role === 'model')!.compatibleWith = {
      runtimeId: 'grounding-model-gui-actor-2b-int4',
      adapterId: 'synthetic-test-adapter',
      hostAppRange: '>=0.1.0',
    };
    await writeFile(join(dir, 'release.json'), JSON.stringify(manifest, null, 2));
    const report = await verifyRelease(join(dir, 'release.json'), SCHEMA);
    expect(report.failures.some((f) => f.gate === 'compatibility' && /disagrees with the delivered model manifest/.test(f.detail))).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });

  it('B07: substituted lock set without backend pins fails', async () => {
    const dir = await copyGoodFixture();
    const manifest = JSON.parse(await readFile(join(dir, 'release.json'), 'utf8')) as {
      lockDigests: Record<string, string>;
    };
    const pkgLock = await readFile(join(REPO, 'package-lock.json')).catch(() => Buffer.from('x'));
    manifest.lockDigests = { 'package-lock.json': createHash('sha256').update(pkgLock).digest('hex') };
    await writeFile(join(dir, 'release.json'), JSON.stringify(manifest, null, 2));
    // Run from a temp cwd with a fake package-lock so the digest matches but pins are missing.
    const tempCwd = await mkdtemp(join(tmpdir(), 'cu-cwd-'));
    await writeFile(join(tempCwd, 'package-lock.json'), pkgLock);
    const previous = process.cwd();
    process.chdir(tempCwd);
    try {
      const report = await verifyRelease(join(dir, 'release.json'), SCHEMA);
      expect(report.failures.some((f) => f.gate === 'compatibility' && /omits required pin/.test(f.detail))).toBe(true);
    } finally {
      process.chdir(previous);
      await rm(tempCwd, { recursive: true, force: true });
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('B08: wrong-executable launch profile fails', async () => {
    const dir = await copyGoodFixture();
    await writeFile(join(dir, 'launch-profile.json'), JSON.stringify({ version: 1, argv: ['wrong-executable'] }));
    const report = await verifyRelease(join(dir, 'release.json'), SCHEMA);
    expect(report.failures.some((f) => f.gate === 'closure' && /must be exactly/.test(f.detail))).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });

  it('N05: launch profile byte drift invalidates the bound digest', async () => {
    const dir = await copyGoodFixture();
    const raw = JSON.parse(await readFile(join(dir, 'launch-profile.json'), 'utf8')) as Record<string, unknown>;
    (raw.envPolicy as Record<string, unknown>).telemetry = 'enabled';
    raw.cwd = '<elsewhere>';
    await writeFile(join(dir, 'launch-profile.json'), JSON.stringify(raw));
    const report = await verifyRelease(join(dir, 'release.json'), SCHEMA);
    const details = report.failures.map((f) => f.detail).join('\n');
    expect(details).toMatch(/launchProfile sha256 mismatch/);
    expect(details).toMatch(/telemetry.*disabled/);
    expect(details).toMatch(/managed-env-root/);
    await rm(dir, { recursive: true, force: true });
  });

  it('N05: argv impersonating the backend with markers still fails', async () => {
    const dir = await copyGoodFixture();
    await writeFile(
      join(dir, 'launch-profile.json'),
      JSON.stringify({ version: 1, argv: ['unreviewed-binary', '-u', '--label', 'aifetchly_windows'] }),
    );
    const report = await verifyRelease(join(dir, 'release.json'), SCHEMA);
    expect(report.failures.some((f) => f.gate === 'closure' && /must be exactly/.test(f.detail))).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });

  it('N05: backend artifact without a launch profile fails', async () => {
    const dir = await copyGoodFixture();
    const manifest = JSON.parse(await readFile(join(dir, 'release.json'), 'utf8')) as {
      artifacts: { role: string; launchProfile?: string }[];
    };
    delete manifest.artifacts.find((a) => a.role === 'windows-env')!.launchProfile;
    await writeFile(join(dir, 'release.json'), JSON.stringify(manifest, null, 2));
    const report = await verifyRelease(join(dir, 'release.json'), SCHEMA);
    expect(report.failures.some((f) => f.gate === 'closure' && /requires a launchProfile/.test(f.detail))).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });

  it('B08: alternate model manifest fails hash binding', async () => {
    const dir = await copyGoodFixture();
    await cp(join(dir, 'model-manifest.json'), join(dir, 'alt-manifest.json'));
    const manifest = JSON.parse(await readFile(join(dir, 'release.json'), 'utf8')) as {
      artifacts: { role: string; modelManifestPath?: string }[];
    };
    manifest.artifacts.find((a) => a.role === 'model')!.modelManifestPath = 'alt-manifest.json';
    await writeFile(join(dir, 'release.json'), JSON.stringify(manifest, null, 2));
    const report = await verifyRelease(join(dir, 'release.json'), SCHEMA);
    expect(report.failures.some((f) => f.gate === 'hash' && /must identify the exact hashed manifest/.test(f.detail))).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });

  it('B08: tampered notice bytes fail the model closure hash', async () => {
    const dir = await copyGoodFixture();
    await writeFile(join(dir, 'LICENSES', 'GUI-ACTOR'), 'tampered-bytes');
    const report = await verifyRelease(join(dir, 'release.json'), SCHEMA);
    expect(report.failures.some((f) => f.gate === 'hash' && /GUI-ACTOR/.test(f.detail))).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });

  it('B09: qualified mac helper without Mach-O fails', async () => {
    const dir = await copyGoodFixture();
    const manifest = JSON.parse(await readFile(join(dir, 'release.json'), 'utf8')) as {
      artifacts: { role: string; signingIdentity?: string }[];
    };
    const macOld = manifest.artifacts.find((a) => a.role === 'mac-native')!;
    macOld.signingIdentity = 'Developer ID Application: AiFetchly (TEAMID1234)';
    (macOld as { qualification?: string }).qualification = 'qualified';
    await writeFile(join(dir, 'release.json'), JSON.stringify(manifest, null, 2));
    const report = await verifyRelease(join(dir, 'release.json'), SCHEMA);
    expect(report.failures.some((f) => f.gate === 'platform' && /not a Mach-O/.test(f.detail))).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });

  it('B07: prerelease semver ranges pass, nonsense ranges fail', async () => {
    const dir = await copyGoodFixture();
    const manifest = JSON.parse(await readFile(join(dir, 'release.json'), 'utf8')) as {
      artifacts: { role: string; compatibleWith?: Record<string, string> }[];
    };
    manifest.artifacts.find((a) => a.role === 'windows-env')!.compatibleWith = { hostAppRange: '>=1.0.0-beta' };
    await writeFile(join(dir, 'release.json'), JSON.stringify(manifest, null, 2));
    let report = await verifyRelease(join(dir, 'release.json'), SCHEMA);
    expect(report.failures.some((f) => f.gate === 'compatibility' && /semver range/.test(f.detail))).toBe(false);
    manifest.artifacts.find((a) => a.role === 'windows-env')!.compatibleWith = { hostAppRange: '=>=>=' };
    await writeFile(join(dir, 'release.json'), JSON.stringify(manifest, null, 2));
    report = await verifyRelease(join(dir, 'release.json'), SCHEMA);
    expect(report.failures.some((f) => f.gate === 'compatibility' && /not a supported semver range/.test(f.detail))).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });

  it('B06: host-consumer with an unrelated schema fails', async () => {
    const dir = await copyGoodFixture();
    const raw = JSON.parse(await readFile(join(dir, 'report-host-consumer.json'), 'utf8')) as Record<string, unknown>;
    raw.schema = 'unrelated-schema';
    await writeFile(join(dir, 'report-host-consumer.json'), JSON.stringify(raw));
    await rehashArtifact(dir, 'report-host-consumer.json');
    const report = await verifyRelease(join(dir, 'release.json'), SCHEMA);
    expect(report.failures.some((f) => /host-consumer.*requires a computer-use-host-report-v1/.test(f.detail))).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });

  it('N02: report sourceCommit diverging from the release fails', async () => {
    const dir = await copyGoodFixture();
    const raw = JSON.parse(await readFile(join(dir, 'report-windows-native.json'), 'utf8')) as {
      run: Record<string, unknown>;
    };
    raw.run.sourceCommit = 'deadbee';
    await writeFile(join(dir, 'report-windows-native.json'), JSON.stringify(raw));
    await rehashArtifact(dir, 'report-windows-native.json');
    const report = await verifyRelease(join(dir, 'release.json'), SCHEMA);
    expect(report.failures.some((f) => /does not match release sourceCommit/.test(f.detail))).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });

  it('N02: unknown runner and unmeasured provider fail', async () => {
    const dir = await copyGoodFixture();
    const raw = JSON.parse(await readFile(join(dir, 'report-windows-native.json'), 'utf8')) as {
      run: Record<string, unknown>;
    };
    raw.run.runnerKind = 'not-a-native-runner';
    raw.run.provider = 'unmeasured';
    await writeFile(join(dir, 'report-windows-native.json'), JSON.stringify(raw));
    await rehashArtifact(dir, 'report-windows-native.json');
    const report = await verifyRelease(join(dir, 'release.json'), SCHEMA);
    const details = report.failures.map((f) => f.detail).join('\n');
    expect(details).toMatch(/not a known runner for this suite/);
    expect(details).toMatch(/not a measured provider identity/);
    await rm(dir, { recursive: true, force: true });
  });

  it('N02: second model without its own parity evidence fails', async () => {
    const dir = await copyGoodFixture();
    const secondManifest = JSON.parse(await readFile(join(dir, 'model-manifest.json'), 'utf8')) as Record<string, unknown>;
    (secondManifest.parityReport as Record<string, unknown>).sha256 = '2'.repeat(64);
    await writeFile(join(dir, 'model-manifest-2.json'), JSON.stringify(secondManifest));
    const manifest = JSON.parse(await readFile(join(dir, 'release.json'), 'utf8')) as {
      artifacts: Record<string, unknown>[];
    };
    const model = { ...(manifest.artifacts.find((a) => a.role === 'model') as Record<string, unknown>) };
    const mmBytes = await readFile(join(dir, 'model-manifest-2.json'));
    model.location = 'model-manifest-2.json';
    model.modelManifestPath = 'model-manifest-2.json';
    model.bytes = mmBytes.length;
    model.sha256 = createHash('sha256').update(mmBytes).digest('hex');
    manifest.artifacts.push(model);
    await writeFile(join(dir, 'release.json'), JSON.stringify(manifest, null, 2));
    const report = await verifyRelease(join(dir, 'release.json'), SCHEMA);
    expect(report.failures.some((f) => /no parity evidence bound to this model's parity digest/.test(f.detail))).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });

  it('N04: empty package record with unlisted shipped files fails', async () => {
    const dir = await copyGoodFixture();
    await repointWindowsEnvToPackage(dir, 'package-manifest.json', { files: [] }, { 'backend.py': 'print(1)\n' });
    const report = await verifyRelease(join(dir, 'release.json'), SCHEMA);
    expect(report.failures.some((f) => f.gate === 'closure' && /empty files closure/.test(f.detail))).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });

  it('N04: renamed package record with a missing declared file fails', async () => {
    const dir = await copyGoodFixture();
    await repointWindowsEnvToPackage(dir, 'environment.json', {
      files: [{ path: 'backend.py', bytes: 9, sha256: '0'.repeat(64) }],
    });
    const report = await verifyRelease(join(dir, 'release.json'), SCHEMA);
    expect(report.failures.some((f) => f.gate === 'closure' && /packaged file missing: backend\.py/.test(f.detail))).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });

  it('N04: package symlink escaping the package directory fails', async () => {
    const dir = await copyGoodFixture();
    const outside = join(dir, 'outside-secret.txt');
    await writeFile(outside, 'external-bytes');
    const { symlink } = await import('node:fs/promises');
    const pkgDir = join(dir, 'pkg');
    await mkdir(pkgDir, { recursive: true });
    await symlink(outside, join(pkgDir, 'backend-link.py'));
    const linkBytes = await readFile(join(pkgDir, 'backend-link.py'));
    await repointWindowsEnvToPackage(dir, 'package-manifest.json', {
      files: [{ path: 'backend-link.py', bytes: linkBytes.length, sha256: createHash('sha256').update(linkBytes).digest('hex') }],
    });
    // repointWindowsEnvToPackage created pkg/ already; the symlink survives (mkdir recursive, no clobber).
    const report = await verifyRelease(join(dir, 'release.json'), SCHEMA);
    expect(report.failures.some((f) => f.gate === 'closure' && /escapes the package directory/.test(f.detail))).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });

  it('N04: null package record returns a structured failure instead of throwing', async () => {
    const dir = await copyGoodFixture();
    await repointWindowsEnvToPackage(dir, 'package-manifest.json', null);
    let report;
    try {
      report = await verifyRelease(join(dir, 'release.json'), SCHEMA);
    } catch (error) {
      throw new Error(`verifyRelease threw instead of returning a report: ${(error as Error).message}`);
    }
    expect(report.failures.some((f) => f.gate === 'closure' && /must be a JSON object/.test(f.detail))).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });

  it('N04: unlisted extracted files fail the closure enumeration', async () => {
    const dir = await copyGoodFixture();
    await repointWindowsEnvToPackage(
      dir,
      'package-manifest.json',
      { files: [{ path: 'backend.py', bytes: 9, sha256: createHash('sha256').update('print(1)\n').digest('hex') }] },
      { 'backend.py': 'print(1)\n', 'stray.dll': 'unexpected-bytes' },
    );
    const report = await verifyRelease(join(dir, 'release.json'), SCHEMA);
    expect(report.failures.some((f) => f.gate === 'closure' && /not declared in the package record: stray\.dll/.test(f.detail))).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });
});

describe('N12 mac launch/signing consistency', () => {
  it('mac launch profile uses the helper schema, not Windows python flags', async () => {
    const { validateLaunchProfile } = await import('../../tooling/release/verify.js');
    expect(validateLaunchProfile(
      { version: 1, argv: ['<helper>', 'mcp'], cwd: '<managed-macos-root>', envPolicy: { telemetry: 'disabled' } },
      't',
    )).toEqual([]);
    const bad = validateLaunchProfile({ version: 1, argv: ['wrong-binary'], cwd: '<managed-macos-root>' }, 't');
    expect(bad.some((f) => /must be exactly/.test(f.detail))).toBe(true);
    // E05: Mac telemetry omission no longer passes.
    const noTelemetry = validateLaunchProfile({ version: 1, argv: ['<helper>', 'mcp'], cwd: '<managed-macos-root>' }, 't');
    expect(noTelemetry.some((f) => /envPolicy must be an object/.test(f.detail))).toBe(true);
  });

  it('explicit qualified state overrides the placeholder bypass', async () => {
    const dir = await copyGoodFixture();
    const manifest = JSON.parse(await readFile(join(dir, 'release.json'), 'utf8')) as {
      artifacts: { role: string; qualification?: string }[];
    };
    // Placeholder identity but explicitly qualified: full native checks apply.
    manifest.artifacts.find((a) => a.role === 'mac-native')!.qualification = 'qualified';
    await writeFile(join(dir, 'release.json'), JSON.stringify(manifest, null, 2));
    const report = await verifyRelease(join(dir, 'release.json'), SCHEMA);
    expect(report.failures.some((f) => f.gate === 'platform' && /not a Mach-O/.test(f.detail))).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });

  it('Intel-only fat binaries are unqualified even when signed-named', async () => {    const dir = await copyGoodFixture();
    // cafebabe + nfat=1 + x86_64 slice (cputype 7, BE).
    const fat = Buffer.concat([
      Buffer.from([0xca, 0xfe, 0xba, 0xbe, 0x00, 0x00, 0x00, 0x01]),
      Buffer.from([0x00, 0x00, 0x00, 0x07, 0x00, 0x00, 0x00, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
    ]);
    await writeFile(join(dir, 'helper-darwin'), fat);
    await import('node:fs/promises').then((m) => m.chmod(join(dir, 'helper-darwin'), 0o755));
    const manifest = JSON.parse(await readFile(join(dir, 'release.json'), 'utf8')) as {
      artifacts: { role: string; signingIdentity?: string; bytes: number; sha256: string; location: string }[];
    };
    const mac = manifest.artifacts.find((a) => a.role === 'mac-native')!;
    mac.signingIdentity = 'Developer ID Application: AiFetchly (TEAMID1234)';
    (mac as { qualification?: string }).qualification = 'qualified';
    mac.bytes = fat.length;
    mac.sha256 = createHash('sha256').update(fat).digest('hex');
    await writeFile(join(dir, 'release.json'), JSON.stringify(manifest, null, 2));
    const report = await verifyRelease(join(dir, 'release.json'), SCHEMA);
    expect(report.failures.some((f) => f.gate === 'platform' && /no Apple Silicon .* slice/.test(f.detail))).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });

  it('mac-native evidence binds to the extracted helper digest', async () => {
    const dir = await copyGoodFixture();
    const raw = JSON.parse(await readFile(join(dir, 'report-mac-native.json'), 'utf8')) as {
      run: Record<string, unknown>;
    };
    raw.run.artifactDigest = 'f'.repeat(64);
    await writeFile(join(dir, 'report-mac-native.json'), JSON.stringify(raw));
    await rehashArtifact(dir, 'report-mac-native.json');
    const report = await verifyRelease(join(dir, 'release.json'), SCHEMA);
    expect(report.failures.some((f) => /matches no shipped helper digest/.test(f.detail))).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });
});

describe('E01/E02/E04 remaining-audit gates', () => {
  it('E01: hand-edited evidence on unpinned locks stays candidate, never qualified', async () => {
    const dir = await copyGoodFixture();
    for (const name of ['report-parity.json', 'report-windows-native.json', 'report-host-consumer.json', 'report-hub-ingest.json', 'report-contract-conformance.json']) {
      const raw = JSON.parse(await readFile(join(dir, name), 'utf8')) as {
        run: Record<string, unknown>; qualification: Record<string, unknown>;
      };
      raw.qualification.producerOnly = false;
      await writeFile(join(dir, name), JSON.stringify(raw));
      await rehashArtifact(dir, name);
    }
    const parityRaw = JSON.parse(await readFile(join(dir, 'report-parity.json'), 'utf8')) as {
      run: Record<string, unknown>;
    };
    parityRaw.run.runnerKind = 'reference';
    await writeFile(join(dir, 'report-parity.json'), JSON.stringify(parityRaw));
    await rehashArtifact(dir, 'report-parity.json');
    const modelRaw = JSON.parse(await readFile(join(dir, 'model-manifest.json'), 'utf8')) as {
      parityReport: Record<string, unknown>;
    };
    const parityBytes = await readFile(join(dir, 'report-parity.json'));
    modelRaw.parityReport.status = 'passed';
    modelRaw.parityReport.sha256 = createHash('sha256').update(parityBytes).digest('hex');
    await writeFile(join(dir, 'model-manifest.json'), JSON.stringify(modelRaw, null, 2));
    await rehashArtifact(dir, 'model-manifest.json');
    // Drop the mac artifact and its suite (locks stay unpinned/unfetched).
    const manifest = JSON.parse(await readFile(join(dir, 'release.json'), 'utf8')) as {
      artifacts: { role: string; suite?: string; location: string }[];
      requiredEvidence: string[];
    };
    manifest.artifacts = manifest.artifacts.filter((a) => !(a.role === 'mac-native' || (a.role === 'evidence' && a.suite === 'mac-native')));
    manifest.requiredEvidence = manifest.requiredEvidence.filter((s) => s !== 'mac-native');
    await writeFile(join(dir, 'release.json'), JSON.stringify(manifest, null, 2));
    const report = await verifyRelease(join(dir, 'release.json'), SCHEMA);
    expect(report.qualification).toBe('candidate');
    await rm(dir, { recursive: true, force: true });
  });

  it('E02: windows artifactDigest mismatch fails', async () => {
    const dir = await copyGoodFixture();
    const raw = JSON.parse(await readFile(join(dir, 'report-windows-native.json'), 'utf8')) as {
      run: Record<string, unknown>;
    };
    raw.run.artifactDigest = 'f'.repeat(64);
    await writeFile(join(dir, 'report-windows-native.json'), JSON.stringify(raw));
    await rehashArtifact(dir, 'report-windows-native.json');
    const report = await verifyRelease(join(dir, 'release.json'), SCHEMA);
    expect(report.failures.some((f) => /matches no shipped artifact digest/.test(f.detail))).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });

  it('E02: disagreeing consumer builds fail consensus', async () => {
    const dir = await copyGoodFixture();
    const raw = JSON.parse(await readFile(join(dir, 'report-host-consumer.json'), 'utf8')) as {
      run: Record<string, unknown>;
    };
    raw.run.consumerBuild = 'aifetchly-host-9.9.9';
    await writeFile(join(dir, 'report-host-consumer.json'), JSON.stringify(raw));
    await rehashArtifact(dir, 'report-host-consumer.json');
    const report = await verifyRelease(join(dir, 'release.json'), SCHEMA);
    expect(report.failures.some((f) => /disagree on consumer build/.test(f.detail))).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });

  it('E02: missing hardware identity fails on native reports', async () => {
    const dir = await copyGoodFixture();
    const raw = JSON.parse(await readFile(join(dir, 'report-windows-native.json'), 'utf8')) as {
      run: Record<string, unknown>;
    };
    delete raw.run.hardware;
    await writeFile(join(dir, 'report-windows-native.json'), JSON.stringify(raw));
    await rehashArtifact(dir, 'report-windows-native.json');
    const report = await verifyRelease(join(dir, 'release.json'), SCHEMA);
    expect(report.failures.some((f) => /run\.hardware/.test(f.detail))).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });

  it('E04: unmarked text blob cannot satisfy windows-env', async () => {
    const dir = await copyGoodFixture();
    const manifest = JSON.parse(await readFile(join(dir, 'release.json'), 'utf8')) as {
      artifacts: { role: string; qualification?: string }[];
    };
    delete manifest.artifacts.find((a) => a.role === 'windows-env')!.qualification;
    await writeFile(join(dir, 'release.json'), JSON.stringify(manifest, null, 2));
    const report = await verifyRelease(join(dir, 'release.json'), SCHEMA);
    expect(report.failures.some((f) => f.gate === 'closure' && /not a verified package record/.test(f.detail))).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });
});

describe('E08 mac team and slice validation', () => {
  it('fat slices with bodies outside the file fail as malformed', async () => {
    const dir = await copyGoodFixture();
    // cafebabe + nfat=1 + arm64 cputype but offset/size past EOF.
    const fat = Buffer.concat([
      Buffer.from([0xca, 0xfe, 0xba, 0xbe, 0x00, 0x00, 0x00, 0x01]),
      Buffer.from([0x01, 0x00, 0x00, 0x0c, 0x00, 0x00, 0x00, 0x03, 0x00, 0x00, 0xff, 0xff, 0x00, 0x00, 0xff, 0xff, 0x00, 0x00, 0x00, 0x00]),
    ]);
    await writeFile(join(dir, 'helper-darwin'), fat);
    await import('node:fs/promises').then((m) => m.chmod(join(dir, 'helper-darwin'), 0o755));
    const manifest = JSON.parse(await readFile(join(dir, 'release.json'), 'utf8')) as {
      artifacts: { role: string; signingIdentity?: string; qualification?: string; bytes: number; sha256: string }[];
    };
    const mac = manifest.artifacts.find((a) => a.role === 'mac-native')!;
    mac.signingIdentity = 'Developer ID Application: AiFetchly (TEAMID1234)';
    mac.qualification = 'qualified';
    mac.bytes = fat.length;
    mac.sha256 = createHash('sha256').update(fat).digest('hex');
    await writeFile(join(dir, 'release.json'), JSON.stringify(manifest, null, 2));
    const report = await verifyRelease(join(dir, 'release.json'), SCHEMA);
    expect(report.failures.some((f) => f.gate === 'platform' && /slice .* body overruns/.test(f.detail))).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });

  it('qualified mac without an explicit team id fails team attribution', async () => {
    const { checkSigningTeam } = await import('../../tooling/release/verify.js');
    const label = 'mac-native:helper';
    // Bare identity with no (TEAMID): unverifiable even against good output.
    expect(checkSigningTeam(
      'Developer ID Application: AiFetchly',
      'TeamIdentifier=TEAMID1234\nAuthority=Developer ID',
      label,
    ).map((f) => f.detail).join('\n')).toMatch(/no explicit \(TEAMID\)/);
    // Unsigned / ad-hoc output.
    expect(checkSigningTeam(
      'Developer ID Application: AiFetchly (TEAMID1234)',
      'Authority=self-signed',
      label,
    ).map((f) => f.detail).join('\n')).toMatch(/lacks TeamIdentifier/);
    // Different team.
    expect(checkSigningTeam(
      'Developer ID Application: AiFetchly (TEAMID1234)',
      'TeamIdentifier=OTHERTEAM9\nAuthority=Developer ID',
      label,
    ).map((f) => f.detail).join('\n')).toMatch(/not found in codesign output/);
    // Matching team passes.
    expect(checkSigningTeam(
      'Developer ID Application: AiFetchly (TEAMID1234)',
      'TeamIdentifier=TEAMID1234\nAuthority=Developer ID',
      label,
    )).toEqual([]);
  });
});

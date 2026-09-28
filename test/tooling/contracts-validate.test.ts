import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runConformance, type FixtureManifestEntry } from '../../tooling/contracts/validate.js';

const REPO_ROOT = process.cwd();

describe('conformance over the real fixture corpus', () => {
  it('every registered schema family has at least one valid and one invalid fixture', () => {
    const report = runConformance(join(REPO_ROOT, 'contracts'));
    expect(report.failures).toEqual([]);
    expect(report.validCount).toBeGreaterThanOrEqual(12);
    expect(report.invalidCount).toBeGreaterThanOrEqual(12);
    for (const family of [
      'desktop/error-v1',
      'desktop/capabilities-v1',
      'desktop/observation-v1',
      'desktop/action-v1',
      'tools/public-tools-v1',
      'tools/plugin-manifest-v1',
      'grounding/capabilities-v1',
      'grounding/request-v1',
      'grounding/result-v1',
      'models/model-manifest-v1',
      'traces/trace-manifest-v1',
      'fixtures/transforms-v1',
    ]) {
      const entries = report.checked.filter((entry) => entry.$id.endsWith(`${family}.json`));
      expect(entries.length, `${family} has fixtures`).toBeGreaterThan(0);
      expect(entries.some((entry) => entry.expectation === 'valid'), `${family} valid fixture`).toBe(true);
      expect(entries.some((entry) => entry.expectation === 'invalid'), `${family} invalid fixture`).toBe(true);
    }
  });

  it('deterministic diagnostics name schema, file and keyword', () => {
    const report = runConformance(join(REPO_ROOT, 'contracts'));
    for (const entry of report.checked) {
      expect(entry.$id).toMatch(/^https:\/\/aifetchly\.dev\//);
      expect(entry.file.length).toBeGreaterThan(0);
    }
  });
});

describe('conformance failure modes (synthetic corpus)', () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'cu-conf-'));
    await mkdir(join(tempDir, 'fixtures'), { recursive: true });
  });
  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  async function writeCorpus(manifest: FixtureManifestEntry[], fixtureFiles: Record<string, unknown>): Promise<void> {
    await writeFile(
      join(tempDir, 'registry.json'),
      JSON.stringify({
        version: 1,
        schemas: [{ $id: 'https://x.dev/s.json', path: 's.schema.json' }],
      }),
    );
    await writeFile(
      join(tempDir, 's.schema.json'),
      JSON.stringify({
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        $id: 'https://x.dev/s.json',
        type: 'object',
        additionalProperties: false,
        required: ['a'],
        properties: { a: { type: 'integer' } },
      }),
    );
    await writeFile(join(tempDir, 'fixtures', 'manifest.json'), JSON.stringify({ version: 1, entries: manifest }));
    for (const [name, content] of Object.entries(fixtureFiles)) {
      await writeFile(join(tempDir, 'fixtures', name), JSON.stringify(content));
    }
  }

  it('reports a failure when an invalid-marked fixture actually validates', async () => {
    await writeCorpus(
      [{ schema: 'https://x.dev/s.json', file: 'ok.json', expectation: 'invalid', description: 'should fail' }],
      { 'ok.json': { a: 1 } },
    );
    const report = runConformance(tempDir);
    expect(report.failures.length).toBe(1);
    expect(report.failures[0]?.kind).toBe('expected-invalid-but-valid');
  });

  it('reports a failure when a valid-marked fixture does not validate', async () => {
    await writeCorpus(
      [{ schema: 'https://x.dev/s.json', file: 'bad.json', expectation: 'valid', description: 'should pass' }],
      { 'bad.json': { a: 'not-an-int' } },
    );
    const report = runConformance(tempDir);
    expect(report.failures[0]?.kind).toBe('expected-valid-but-invalid');
    expect(report.failures[0]?.keywords?.length).toBeGreaterThan(0);
  });

  it('hard-errors when the manifest references a missing fixture file', async () => {
    await writeCorpus(
      [{ schema: 'https://x.dev/s.json', file: 'ghost.json', expectation: 'valid', description: 'missing' }],
      {},
    );
    expect(() => runConformance(tempDir)).toThrow(/missing fixture/i);
  });

  it('hard-errors when the manifest references an unregistered schema', async () => {
    await writeCorpus(
      [{ schema: 'https://x.dev/other.json', file: 'ok.json', expectation: 'valid', description: 'unregistered' }],
      { 'ok.json': { a: 1 } },
    );
    expect(() => runConformance(tempDir)).toThrow(/not in local registry/i);
  });
});

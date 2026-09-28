import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadContractRegistry, SchemaReferenceError } from '../../tooling/contracts/registry.js';

const REPO_CONTRACTS = join(process.cwd(), 'contracts');

describe('packaged registry (repo contracts)', () => {
  it('loads every schema registered in registry.json', () => {
    const registry = loadContractRegistry(REPO_CONTRACTS);
    expect(registry.size).toBeGreaterThanOrEqual(12);
    expect(registry.has('https://aifetchly.dev/schemas/computer-use/desktop/error-v1.json')).toBe(true);
  });

  it('compiles every schema with cross-file $refs resolved locally', () => {
    const registry = loadContractRegistry(REPO_CONTRACTS);
    expect(() => registry.compile('https://aifetchly.dev/schemas/computer-use/desktop/action-v1.json')).not.toThrow();
  });

  it('rejects $ref targets outside the registry (no network fallback)', () => {
    const registry = loadContractRegistry(REPO_CONTRACTS);
    expect(() =>
      registry.compile('https://aifetchly.dev/schemas/computer-use/not/registered-v1.json'),
    ).toThrow(SchemaReferenceError);
  });
});

describe('registry integrity (fail-closed cases)', () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'cu-registry-'));
  });
  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  async function writeRegistry(schemas: unknown): Promise<void> {
    await mkdir(tempDir, { recursive: true });
    await writeFile(join(tempDir, 'registry.json'), JSON.stringify({ version: 1, schemas }));
    for (const entry of schemas as unknown as { path: string; $id: string }[]) {
      await mkdir(join(tempDir, entry.path, '..'), { recursive: true });
      await writeFile(
        join(tempDir, entry.path),
        JSON.stringify({
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          $id: entry.$id,
          type: 'object',
        }),
      );
    }
  }

  it('rejects duplicate $ids', async () => {
    const dup = [
      { $id: 'https://x.dev/a.json', path: 'a/a.schema.json' },
      { $id: 'https://x.dev/a.json', path: 'a/a2.schema.json' },
    ];
    await writeRegistry(dup);
    expect(() => loadContractRegistry(tempDir)).toThrow(/duplicate/i);
  });

  it('rejects registry entries whose file is missing', async () => {
    const missing = [{ $id: 'https://x.dev/b.json', path: 'b/b.schema.json' }];
    await writeFile(join(tempDir, 'registry.json'), JSON.stringify({ version: 1, schemas: missing }));
    await rm(join(tempDir, 'b'), { recursive: true, force: true });
    expect(() => loadContractRegistry(tempDir)).toThrow(/missing schema file/i);
  });
});

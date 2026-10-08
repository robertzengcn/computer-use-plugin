import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadContractRegistry } from '../../tooling/contracts/registry.js';

/**
 * M01: compatibility/version-evolution procedure (contracts/COMPATIBILITY.md).
 * A future-version document must be REJECTED by the pinned v1 validator, and
 * the compatibility procedure itself must ship in the contract archive.
 */

const REPO = process.cwd();

describe('contract version evolution (M01 procedure)', () => {
  const registry = loadContractRegistry(join(REPO, 'contracts'));

  it('a v2-marked instance fails the pinned v1 schema (no silent acceptance)', () => {
    const validator = registry.compile('https://aifetchly.dev/schemas/computer-use/tools/public-tools-v1.json');
    const current = JSON.parse(
      readFileSync(join(REPO, 'contracts', 'fixtures', 'tools', 'valid', 'public-tools-v1.json'), 'utf8'),
    );
    // The schema pins contractVersion to const 1; a future version must fail
    // closed rather than validate against the old surface.
    const future = { ...current, contractVersion: 2 };
    expect(validator(future)).toBe(false);
  });

  it('an unknown contract family version is not registered (fail closed)', () => {
    expect(registry.has('https://aifetchly.dev/schemas/computer-use/desktop/error-v2.json')).toBe(false);
    expect(() =>
      registry.compile('https://aifetchly.dev/schemas/computer-use/desktop/error-v2.json'),
    ).toThrow(/not in local registry/);
  });

  it('the compatibility procedure ships next to the schemas it governs', () => {
    const doc = readFileSync(join(REPO, 'contracts', 'COMPATIBILITY.md'), 'utf8');
    expect(doc).toMatch(/previous-consumer/i);
    expect(doc).toMatch(/No in-place mutation/i);
    expect(doc).toMatch(/rules\/semantic-rules-v1\.json/);
  });
});

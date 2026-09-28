import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadContractRegistry } from '../../tooling/contracts/registry.js';

const REPO = process.cwd();

describe('plugin manifest (design §7.1)', () => {
  const registry = loadContractRegistry(join(REPO, 'contracts'));
  const validator = registry.compile(
    'https://aifetchly.dev/schemas/computer-use/tools/plugin-manifest-v1.json',
  );

  function loadManifest(): unknown {
    return JSON.parse(readFileSync(join(REPO, 'plugin', 'manifest.json'), 'utf8'));
  }

  it('plugin/manifest.json conforms to plugin-manifest-v1', () => {
    const valid = validator(loadManifest());
    expect(validator.errors ?? []).toEqual([]);
    expect(valid).toBe(true);
  });

  it('declares only host-allowlisted local AI runtime IDs', () => {
    const manifest = loadManifest() as { localAiRuntimes: { runtimeId: string }[] };
    for (const runtime of manifest.localAiRuntimes) {
      expect(runtime.runtimeId).toMatch(/^grounding-(onnxruntime|model-gui-actor-2b-(fp16|int4))$/);
    }
  });

  it('backends are honestly marked spike-pending until Phase 0 completes', () => {
    const manifest = loadManifest() as { backend: Record<string, { status: string }> };
    for (const platform of Object.keys(manifest.backend)) {
      expect(['spike-pending', 'candidate', 'qualified']).toContain(manifest.backend[platform]?.status);
    }
  });
});

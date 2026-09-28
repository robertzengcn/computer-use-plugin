/**
 * Generated TypeScript declarations for the canonical schemas (design §3.7).
 * Output is deterministic; committed contracts/types/*.d.ts are drift-checked
 * by contracts:check so the archive can never silently diverge (CU-PLUGIN-16).
 */
import { compile, type JSONSchema } from 'json-schema-to-typescript';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { loadContractRegistry } from './registry.js';

const BANNER = '/** GENERATED from contracts/ — do not edit; regenerate with npm run contracts:build. */';

/** Generate name → declaration content for every registered schema. */
export async function generateDeclarations(contractsDir: string): Promise<Map<string, string>> {
  const registry = loadContractRegistry(contractsDir);
  const schemas = new Map<string, unknown>();
  for (const $id of registry.ids()) {
    schemas.set($id, JSON.parse(await readFile(join(contractsDir, registry.pathFor($id)), 'utf8')));
  }
  const output = new Map<string, string>();
  for (const $id of registry.ids()) {
    const relativePath = registry.pathFor($id);
    // Family-qualified name (e.g. "desktop/error-v1") keeps families with
    // identical file baselines from colliding in the output map.
    const name = relativePath.replace(/\.schema\.json$/, '');
    const selfContained = inlineExternalRefs(schemas.get($id), schemas, 0);
    const content = await compile(selfContained as JSONSchema, toPascalCase(name), {
      bannerComment: '',
      cwd: contractsDir,
      additionalProperties: false,
      style: { singleQuote: true },
    });
    output.set(name, `${BANNER}\n${content.trimEnd()}\n`);
  }
  return output;
}

const ID_PREFIX = 'https://aifetchly.dev/schemas/computer-use/';
const MAX_INLINE_DEPTH = 8;

function inlineExternalRefs(node: unknown, schemas: Map<string, unknown>, refDepth: number): unknown {
  if (refDepth > MAX_INLINE_DEPTH) {
    throw new Error('schema ref inlining exceeded expansion guard (cyclic refs?)');
  }
  if (Array.isArray(node)) {
    return node.map((item) => inlineExternalRefs(item, schemas, refDepth));
  }
  if (node !== null && typeof node === 'object') {
    const record = node as Record<string, unknown>;
    const ref = typeof record.$ref === 'string' ? record.$ref : undefined;
    if (ref !== undefined && ref.startsWith(ID_PREFIX)) {
      const [base, ...pointerParts] = ref.split('#');
      const target = schemas.get(base ?? '');
      if (target === undefined) {
        throw new Error(`ref target not in registry: ${ref}`);
      }
      const pointer = pointerParts.join('#').replace(/^\/+/, '');
      let resolved: unknown = target;
      for (const segment of pointer.split('/').filter((s) => s.length > 0)) {
        if (resolved === null || typeof resolved !== 'object') {
          throw new Error(`bad ref pointer: ${ref}`);
        }
        resolved = (resolved as Record<string, unknown>)[segment];
      }
      return inlineExternalRefs(resolved, schemas, refDepth + 1);
    }
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) {
      result[key] = inlineExternalRefs(value, schemas, refDepth);
    }
    return result;
  }
  return node;
}

/** Write declarations to contracts/types/. Returns written file names. */
export async function writeDeclarations(contractsDir: string): Promise<string[]> {
  const generated = await generateDeclarations(contractsDir);
  const written: string[] = [];
  for (const [name, content] of [...generated.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const target = join(contractsDir, 'types', `${name}.d.ts`);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
    written.push(name);
  }
  return written;
}

/** Names whose committed declaration differs from regeneration. */
export async function checkDeclarationDrift(contractsDir: string): Promise<string[]> {
  const generated = await generateDeclarations(contractsDir);
  const drifted: string[] = [];
  for (const [name, content] of generated) {
    let committed: string;
    try {
      committed = await readFile(join(contractsDir, 'types', `${name}.d.ts`), 'utf8');
    } catch {
      drifted.push(name);
      continue;
    }
    if (committed !== content) {
      drifted.push(name);
    }
  }
  return drifted;
}

function toPascalCase(value: string): string {
  return value
    .split(/[-_/]/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

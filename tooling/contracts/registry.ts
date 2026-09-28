/**
 * Packaged local schema registry (design §3.7): every $ref resolves through
 * contracts/registry.json. There is no network fallback — an unregistered
 * reference is a hard error, not a fetch.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Ajv2020, type ValidateFunction } from 'ajv/dist/2020.js';

export class SchemaReferenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SchemaReferenceError';
  }
}

export interface RegistryEntry {
  readonly $id: string;
  readonly path: string;
}

export interface ContractRegistry {
  /** Number of registered schemas. */
  readonly size: number;
  /** True when the $id is registered. */
  has($id: string): boolean;
  /** All registered $ids in registry order. */
  ids(): readonly string[];
  /** Compile a registered schema, resolving refs only through the registry. */
  compile($id: string): ValidateFunction;
}

interface RegistryFile {
  readonly version: number;
  readonly schemas: readonly RegistryEntry[];
}

export function loadContractRegistry(contractsDir: string): ContractRegistry {
  const registryPath = join(contractsDir, 'registry.json');
  let raw: string;
  try {
    raw = readFileSync(registryPath, 'utf8');
  } catch (error) {
    throw new SchemaReferenceError(
      `contracts registry not found at ${registryPath}: ${(error as Error).message}`,
    );
  }
  const parsed = JSON.parse(raw) as RegistryFile;
  const seen = new Set<string>();
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  // RFC3339 date-time, the same shape ajv-formats registers; declared here to
  // keep the validator dependency-free.
  ajv.addFormat(
    'date-time',
    /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(\.\d+)?([Zz]|[+-]\d{2}:\d{2})$/,
  );

  for (const entry of parsed.schemas) {
    if (seen.has(entry.$id)) {
      throw new SchemaReferenceError(`duplicate $id in registry: ${entry.$id}`);
    }
    const schemaPath = join(contractsDir, entry.path);
    let schemaRaw: string;
    try {
      schemaRaw = readFileSync(schemaPath, 'utf8');
    } catch (error) {
      throw new SchemaReferenceError(
        `missing schema file for ${entry.$id} at ${entry.path}: ${(error as Error).message}`,
      );
    }
    const schema = JSON.parse(schemaRaw) as { $id?: string };
    if (schema.$id !== entry.$id) {
      throw new SchemaReferenceError(
        `schema at ${entry.path} declares $id '${schema.$id ?? '(none)'}' but registry lists '${entry.$id}'`,
      );
    }
    ajv.addSchema(schema, entry.$id);
    seen.add(entry.$id);
  }

  const ids = [...seen];

  return {
    size: seen.size,
    has: ($id: string) => seen.has($id),
    ids: () => ids,
    compile($id: string): ValidateFunction {
      if (!seen.has($id)) {
        throw new SchemaReferenceError(`$id not in local registry: ${$id}`);
      }
      try {
        return ajv.compile({ $ref: $id });
      } catch (error) {
        throw new SchemaReferenceError(`failed to compile ${$id}: ${(error as Error).message}`);
      }
    },
  };
}

/**
 * Fixture conformance runner (design §3.7): every valid fixture must pass its
 * schema and every invalid fixture must fail. A manifest entry naming a
 * missing file or unregistered schema is a hard error, never a skip — missing
 * evidence is not a pass (CU-PLUGIN-21).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadContractRegistry } from './registry.js';
import {
  checkGroundingRequest,
  checkGroundingResult,
  declaredRuleIds,
  implementedRuleIds,
  type SemanticViolation,
} from './rules.js';

export interface FixtureManifestEntry {
  readonly schema: string;
  readonly file: string;
  readonly expectation: 'valid' | 'invalid';
  readonly description: string;
}

export type ConformanceFailureKind =
  | 'expected-valid-but-invalid'
  | 'expected-invalid-but-valid'
  | 'missing-required-family-fixture';

export interface ConformanceFailure {
  readonly kind: ConformanceFailureKind;
  readonly $id: string;
  readonly file: string;
  readonly instancePath?: string;
  readonly keywords?: readonly string[];
}

export interface ConformanceCheckedEntry extends FixtureManifestEntry {
  readonly $id: string;
}

export interface ConformanceReport {
  readonly schemaCount: number;
  readonly validCount: number;
  readonly invalidCount: number;
  readonly checked: readonly ConformanceCheckedEntry[];
  readonly failures: readonly ConformanceFailure[];
}

interface FixtureManifestFile {
  readonly version: number;
  readonly entries: readonly FixtureManifestEntry[];
}

export function runConformance(contractsDir: string): ConformanceReport {
  const registry = loadContractRegistry(contractsDir);
  const manifestPath = join(contractsDir, 'fixtures', 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as FixtureManifestFile;

  // M01: the published semantic-rules document and the implementation must
  // declare the exact same rule set — drift in either direction fails.
  const declared = declaredRuleIds(contractsDir);
  const implemented = implementedRuleIds();
  if (JSON.stringify(declared) !== JSON.stringify(implemented)) {
    throw new Error(
      `semantic-rules-v1.json drift: declared [${declared.join(', ')}] but implemented [${implemented.join(', ')}]`,
    );
  }

  const checked: ConformanceCheckedEntry[] = [];
  const failures: ConformanceFailure[] = [];
  let validCount = 0;
  let invalidCount = 0;

  for (const entry of manifest.entries) {
    if (!registry.has(entry.schema)) {
      throw new Error(`fixture manifest references schema not in local registry: ${entry.schema}`);
    }
    const fixturePath = join(contractsDir, 'fixtures', entry.file);
    let fixtureRaw: string;
    try {
      fixtureRaw = readFileSync(fixturePath, 'utf8');
    } catch (error) {
      throw new Error(`missing fixture file ${entry.file} (${entry.schema}): ${(error as Error).message}`);
    }
    const instance: unknown = JSON.parse(fixtureRaw);
    const validator = registry.compile(entry.schema);
    const passes = validator(instance);

    // Cross-field semantic rules for the grounding families (design §3.4.2):
    // schema-valid fixtures must also satisfy bounds the schema cannot express.
    const semantic: readonly SemanticViolation[] = entry.schema.endsWith('grounding/result-v1.json')
      ? checkGroundingResult(instance)
      : entry.schema.endsWith('grounding/request-v1.json')
        ? checkGroundingRequest(instance)
        : [];

    if (entry.expectation === 'valid') {
      if (passes && semantic.length === 0) {
        validCount += 1;
      } else {
        failures.push({
          kind: 'expected-valid-but-invalid',
          $id: entry.schema,
          file: entry.file,
          instancePath: validator.errors?.[0]?.instancePath ?? semantic[0]?.detail ?? '',
          keywords:
            semantic.length > 0
              ? semantic.map((v) => v.rule)
              : (validator.errors ?? []).map((e) => String(e.keyword)),
        });
      }
    } else if (passes && semantic.length > 0) {
      // Semantically invalid fixtures that are schema-valid still count as
      // correctly rejected when a rule fires.
      invalidCount += 1;
    } else if (passes) {
      failures.push({
        kind: 'expected-invalid-but-valid',
        $id: entry.schema,
        file: entry.file,
      });
    } else {
      invalidCount += 1;
    }
    checked.push({ ...entry, $id: entry.schema });
  }

  return { schemaCount: registry.size, validCount, invalidCount, checked, failures };
}

/** CLI surface for `npm run contracts:check`. */
export function formatConformanceReport(report: ConformanceReport): string {
  const lines = [
    `contracts:check — ${report.schemaCount} schemas, ${report.validCount} valid fixtures, ${report.invalidCount} invalid fixtures`,
  ];
  for (const failure of report.failures) {
    lines.push(
      `FAIL [${failure.kind}] ${failure.$id} ${failure.file}${failure.instancePath ? ` at ${failure.instancePath}` : ''}`,
    );
  }
  if (report.failures.length === 0) {
    lines.push('all conformance expectations hold');
  }
  return lines.join('\n');
}

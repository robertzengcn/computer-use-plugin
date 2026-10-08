/**
 * Offline evaluation CLI (design §2.2 `npm run eval -- replay|compare`).
 * Replay and comparison are read-only, local and process-free: neither mode
 * can execute a recorded click or start a desktop backend (CU-PLUGIN-12).
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  runCli,
  type CommandResult,
  type CommandSpec,
} from '../tooling/cli.js';
import { evaluateCases, renderHtmlReport, renderJsonReport, reportPasses, type EvalCaseInput } from './report.js';
import {
  applyTransformsToCapture,
  IncompatibleConfigurationException,
  loadProfilesFromFile,
  loadTraceBundle,
  recordedRunner,
  syntheticRunner,
  type RunnerConfiguration,
  type RunnerProfile,
} from './runner/runners.js';

interface DatasetManifest {
  readonly schemaVersion: number;
  readonly datasetId: string;
  readonly version: string;
  readonly cases: readonly {
    readonly id: string;
    readonly consentClass: 'synthetic' | 'reviewed';
    readonly split: 'regression' | 'calibration' | 'held_out';
    readonly taskDescription: string;
    readonly contentSha256?: string;
    readonly expected:
      | { readonly kind: 'region'; readonly region: { readonly x: number; readonly y: number; readonly w: number; readonly h: number } }
      | { readonly kind: 'absent' }
      | { readonly kind: 'ambiguous' };
  }[];
}

const DATASET_SCHEMA_ID = 'https://aifetchly.dev/schemas/computer-use/eval/dataset-manifest-v1.json';

/** Validate and load a dataset manifest through the canonical registry (B09). */
async function loadDataset(evalDir: string, datasetId: string): Promise<DatasetManifest & { manifestSha256: string }> {
  const datasetPath = join(evalDir, 'datasets', datasetId, 'dataset.json');
  const raw = await readFile(datasetPath, 'utf8');
  const manifest = JSON.parse(raw) as unknown;
  const { loadContractRegistry } = await import('../tooling/contracts/registry.js');
  const validator = loadContractRegistry(join(process.cwd(), 'contracts')).compile(DATASET_SCHEMA_ID);
  if (!validator(manifest)) {
    const first = validator.errors?.[0];
    throw new Error(
      `dataset ${datasetId} fails dataset-manifest-v1: ${first?.instancePath ?? ''} ${first?.message ?? 'invalid'}`,
    );
  }
  const typed = manifest as DatasetManifest;
  const ids = typed.cases.map((entry) => entry.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error(`dataset ${datasetId}: duplicate case ids`);
  }
  // E15: define what each content hash covers (case id + expected geometry
  // canonical JSON) and verify the referenced bytes. Tampered fixture bytes
  // with unchanged declared hashes fail instead of scoring silently.
  for (const entry of typed.cases) {
    if (typeof entry.contentSha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(entry.contentSha256)) {
      throw new Error(`dataset ${datasetId} case '${entry.id}' has invalid contentSha256 (must be 64 hex)`);
    }
    const expectedHash = computeCaseContentHash(entry.id, entry.expected);
    if (expectedHash.toLowerCase() !== entry.contentSha256.toLowerCase()) {
      throw new Error(
        `dataset ${datasetId} case '${entry.id}' contentSha256 mismatch: declared ${entry.contentSha256.slice(0, 8)}… != computed ${expectedHash.slice(0, 8)}… — fixture bytes were tampered or hash is stale`,
      );
    }
  }
  const manifestSha256 = createHash('sha256').update(raw).digest('hex');
  return { ...(typed as DatasetManifest), manifestSha256 } as DatasetManifest & { manifestSha256: string };
}

/** E15: canonical content hash covering case identity + expected geometry.
 * Matches the Python fixture generator (json.dumps sort_keys, separators).
 */
function computeCaseContentHash(
  id: string,
  expected: { kind: string; region?: { x: number; y: number; w: number; h: number } },
): string {
  const canonical = canonicalJson({ id, expected: normalizeExpected(expected) });
  return createHash('sha256').update(canonical).digest('hex');
}

function normalizeExpected(expected: { kind: string; region?: { x: number; y: number; w: number; h: number } }): unknown {
  if (expected.kind === 'region' && expected.region !== undefined) {
    return { kind: 'region', region: expected.region };
  }
  return { kind: expected.kind };
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? '';
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalJson(v)).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

function datasetInputs(manifest: DatasetManifest): EvalCaseInput[] {
  return manifest.cases.map((entry) => ({
    caseId: entry.id,
    split: entry.split,
    consentClass: entry.consentClass,
    contentSha256: entry.contentSha256,
    expected: { kind: entry.expected.kind, region: 'region' in entry.expected ? entry.expected.region : undefined },
  }));
}

const EVAL_DIR = 'eval';

export const evalCommands: readonly CommandSpec[] = [
  {
    name: 'replay',
    summary: 'Re-evaluate saved evidence with an exact compatible configuration (no backend, no input)',
    handler: async (args): Promise<CommandResult> => {
      const bundle = stringFlag(args, 'bundle');
      const runnerName = stringFlag(args, 'runner');
      const datasetId = stringFlag(args, 'dataset');
      const expectedConfig = stringFlag(args, 'config');
      if (bundle === undefined || runnerName === undefined) {
        return {
          outcome: 'invalidArgs',
          message: 'replay requires --bundle <path> and --runner <profile> (design §2.2 form)',
        };
      }
      const profiles = await loadProfilesFromFile(join(process.cwd(), EVAL_DIR, 'runner', 'profiles.json'));
      const profile = profiles.get(runnerName);
      if (profile === undefined) {
        return { outcome: 'invalidArgs', message: `unknown runner profile '${runnerName}'` };
      }
      // Expectations come from --dataset when given, otherwise from the
      // bundle's own annotations.json (design §3.6).
      const dataset = datasetId !== undefined
        ? await loadDataset(join(process.cwd(), EVAL_DIR), datasetId)
        : undefined;
      const { manifest, records: rawRecords, annotations, annotationHashes } = await loadTraceBundle(bundle);
      // M05: score in original capture pixels — model-input candidates are
      // mapped through their declared transform before region comparison.
      let records: typeof rawRecords;
      try {
        records = applyTransformsToCapture(rawRecords);
      } catch (error) {
        return { outcome: 'failed', message: (error as Error).message };
      }
      const expectedSource = dataset !== undefined
        ? { label: datasetId as string, version: dataset.version, cases: dataset.cases }
        : annotationsSource(manifest.traceId, annotations, annotationHashes);
      if (expectedSource === undefined) {
        return {
          outcome: 'invalidArgs',
          message:
            'bundle has no annotations.json; pass --dataset <id> so replay has expectations to score against',
        };
      }
      if (
        expectedConfig !== undefined &&
        manifest.configuration.modelConfigurationId !== expectedConfig
      ) {
        return {
          outcome: 'failed',
          message: new IncompatibleConfigurationException(
            expectedConfig,
            manifest.configuration.modelConfigurationId,
          ).message,
        };
      }
      try {
        // E09: preserve the complete verified bundle identity (provider/runtime/
        // manifest included) — never drop identities while constructing steps,
        // and label the report from the verified bundle plus runner kind so
        // runner differences stay distinguishable.
        const bundleConfiguration: RunnerConfiguration = {
          modelConfigurationId: manifest.configuration.modelConfigurationId,
          adapterId: manifest.configuration.adapterId,
          adapterVersion: manifest.configuration.adapterVersion,
          preprocessingRevision: manifest.configuration.preprocessingRevision,
          decodingRevision: manifest.configuration.decodingRevision,
          calibrationRevision: manifest.configuration.calibrationRevision,
          ...(manifest.configuration.onnxRuntimeVersion !== undefined
            ? { onnxRuntimeVersion: manifest.configuration.onnxRuntimeVersion }
            : {}),
          ...(manifest.configuration.executionProvider === 'dml' ||
          manifest.configuration.executionProvider === 'coreml' ||
          manifest.configuration.executionProvider === 'cpu'
            ? { executionProvider: manifest.configuration.executionProvider }
            : {}),
          ...(manifest.configuration.modelManifestSha256 !== undefined
            ? { modelManifestSha256: manifest.configuration.modelManifestSha256 }
            : {}),
        };
        const run = recordedRunner(profile, records.map((record) => ({
          caseId: record.caseId,
          candidates: record.candidates,
          inferenceMs: record.inferenceMs,
          configuration: bundleConfiguration,
        })));
        const inputs: EvalCaseInput[] = expectedSource.cases.map((entry) => ({
          caseId: entry.id,
          split: entry.split,
          consentClass: entry.consentClass,
          contentSha256: entry.contentSha256,
          expected: {
            kind: entry.expected.kind,
            region: 'region' in entry.expected ? entry.expected.region : undefined,
          },
        }));
        // E09: missing records produce named skipped case evidence via
        // evaluateCases (outcome absent => skipped), not an unstructured exception.
        const outcomes: { caseId: string; candidates: { x: number; y: number }[]; inferenceMs: number }[] = [];
        for (const entry of expectedSource.cases) {
          try {
            const result = run(entry.id);
            outcomes.push({
              caseId: result.caseId,
              candidates: result.candidates.map((candidate) => candidate.point),
              inferenceMs: result.inferenceMs,
            });
          } catch (error) {
            if (error instanceof IncompatibleConfigurationException) {
              throw error;
            }
            // Missing recorded evidence for this case: omit from outcomes so
            // evaluateCases records a named skipped (not a pass).
            continue;
          }
        }
        // B17: records outside the expected case set must not vanish silently.
        const recordIds = new Set(records.map((record) => record.caseId));
        const extra = expectedSource.cases.filter((entry) => !recordIds.has(entry.id)).length;
        // E15: complete provenance — run ID, source commit, fixture-manifest
        // hash, tool versions and explicit unavailable measurements.
        const startedAt = new Date().toISOString();
        const report = evaluateCases(
          inputs,
          outcomes,
          {
            mode: 'replay',
            datasetId: expectedSource.label,
            datasetVersion: `${expectedSource.version}+trace:${manifest.traceId}`,
            runnerKind: profile.kind,
            startedAt,
            finishedAt: new Date().toISOString(),
            runId: `replay-${manifest.traceId}`,
            sourceCommit: 'unknown (portable: git commit not recorded offline)',
            ...(dataset !== undefined ? { datasetManifestSha256: (dataset as unknown as { manifestSha256?: string }).manifestSha256 } : {}),
            toolVersions: { node: process.version, evalRunner: 'replay-v1' },
            memoryMb: null,
            measurementMethod: 'unavailable (portable: no hardware/memory measurement)',
          },
          bundleConfiguration,
          { extraRecords: records.length - (expectedSource.cases.length - extra) },
        );
        await writeArtifacts(args, report, `replay-${manifest.traceId}`);
        return {
          outcome: reportPasses(report) ? 'ok' : 'failed',
          message: renderJsonReport(report),
          result: report,
        };
      } catch (error) {
        if (error instanceof IncompatibleConfigurationException) {
          return { outcome: 'failed', message: error.message };
        }
        throw error;
      }
    },
  },
  {
    name: 'compare',
    summary: 'Compare configurations on identical evidence (reports differences, not raw confidence)',
    handler: async (args): Promise<CommandResult> => {
      const datasetId = stringFlag(args, 'dataset');
      const configs = stringFlag(args, 'configs');
      if (datasetId === undefined || configs === undefined) {
        return { outcome: 'invalidArgs', message: 'compare requires --dataset <id> and --configs <a,b>' };
      }
      const configNames = configs.split(',').map((value) => value.trim()).filter((value) => value.length > 0);
      if (configNames.length < 2) {
        return { outcome: 'invalidArgs', message: 'compare needs at least two comma-separated configs' };
      }
      const profiles = await loadProfilesFromFile(join(process.cwd(), EVAL_DIR, 'runner', 'profiles.json'));
      const selected = configNames.map((name): RunnerProfile | undefined => profiles.get(name));
      const missing = selected.findIndex((profile) => profile === undefined);
      if (missing >= 0) {
        return { outcome: 'invalidArgs', message: `unknown runner profile '${configNames[missing]}'` };
      }
      // B16: compare executes synthetic stubs only. A recorded profile cannot
      // be silently rescored as if it were a live comparison arm.
      const nonSynthetic = (selected as RunnerProfile[]).find((profile) => profile.kind !== 'synthetic');
      if (nonSynthetic !== undefined) {
        return {
          outcome: 'invalidArgs',
          message: `compare runs synthetic profiles only; '${nonSynthetic.name}' is kind '${nonSynthetic.kind}' — use replay for recorded evidence`,
        };
      }
      const manifest = await loadDataset(join(process.cwd(), EVAL_DIR), datasetId);
      const inputs = datasetInputs(manifest);
      const manifestSha = (manifest as unknown as { manifestSha256?: string }).manifestSha256;

      const reports = (selected as RunnerProfile[]).map((profile) => {
        const runner = syntheticRunner(profile);
        const outcomes = inputs.map((input) => {
          const result = runner(input.caseId);
          return {
            caseId: result.caseId,
            candidates: result.candidates.map((candidate) => candidate.point),
            inferenceMs: result.inferenceMs,
          };
        });
        return evaluateCases(
          inputs,
          outcomes,
          {
            mode: 'compare',
            datasetId,
            datasetVersion: manifest.version,
            runnerKind: profile.kind,
            runId: `compare-${datasetId}-${profile.name ?? profile.configuration.modelConfigurationId}`,
            sourceCommit: 'unknown (portable: git commit not recorded offline)',
            ...(manifestSha !== undefined ? { datasetManifestSha256: manifestSha } : {}),
            toolVersions: { node: process.version, evalRunner: 'compare-v1' },
            memoryMb: null,
            measurementMethod: 'unavailable (portable: no hardware/memory measurement)',
          },
          profile.configuration,
        );
      });
      // E15: both modes can save JSON/HTML with exact identities and explicit
      // unavailable measurements (same file-writing path as replay).
      const outDir = stringFlag(args, 'out');
      if (outDir !== undefined) {
        for (let i = 0; i < reports.length; i++) {
          const cfg = configNames[i] ?? `config-${i}`;
          await writeArtifacts(args, reports[i]!, `compare-${datasetId}-${cfg}`);
        }
      }

      const identicalEvidence = reports.every((report) =>
        report.cases.every((record, index) => record.fixtureHash === reports[0]?.cases[index]?.fixtureHash),
      );
      const summary = {
        identicalEvidence,
        configs: reports.map((report, index) => ({
          config: configNames[index],
          regionHitRate: report.aggregate.regionHitRate,
          absenceFalseAccepts: report.aggregate.absenceFalseAccepts,
          latency: report.aggregate.latency,
          failed: report.aggregate.failed,
        })),
      };
      const allReportsPass = reports.every((report) => reportPasses(report));
      const lines = [
        `compare on ${datasetId} v${manifest.version} (identical evidence: ${identicalEvidence})`,
        ...summary.configs.map(
          (entry) =>
            `  ${entry.config}: region-hit ${entry.regionHitRate ?? '—'}, absence false-accepts ${entry.absenceFalseAccepts}, p95 ${entry.latency?.p95 ?? '—'}ms, failed ${entry.failed}`,
        ),
      ];
      return {
        outcome: identicalEvidence && allReportsPass ? 'ok' : 'failed',
        message: lines.join('\n'),
        result: { summary, reports },
      };
    },
  },
];

function stringFlag(args: { flags: ReadonlyMap<string, string | true> }, name: string): string | undefined {
  const value = args.flags.get(name);
  return typeof value === 'string' ? value : undefined;
}

interface ExpectedSource {
  readonly label: string;
  readonly version: string;
  readonly cases: DatasetManifest['cases'];
}

function annotationsSource(
  traceId: string,
  annotations: ReadonlyMap<string, { kind: 'region' | 'absent' | 'ambiguous'; region?: { x: number; y: number; w: number; h: number }; consentClass?: 'synthetic' | 'reviewed'; split?: 'regression' | 'calibration' | 'held_out' }>,
  contentHashes?: Readonly<Record<string, string>>,
): ExpectedSource | undefined {
  if (annotations.size === 0) {
    return undefined;
  }
  return {
    label: `${traceId} (annotations)`,
    version: `annotations:${traceId}`,
    // E15: preserve reviewed/held-out provenance when the bundle carries it;
    // reviewed evidence is never relabeled synthetic. Missing provenance
    // defaults to synthetic/regression for tooling exercise only (labeled in
    // runner output, never model accuracy), with unknown remaining explicit
    // via content-hash verification and producerOnly flags in the report.
    cases: [...annotations.entries()].map(([id, annotation]) => ({
      id,
      consentClass: annotation.consentClass ?? ('synthetic' as const),
      split: annotation.split ?? ('regression' as const),
      taskDescription: '',
      contentSha256: contentHashes?.[id],
      expected:
        annotation.kind === 'region' && annotation.region !== undefined
          ? { kind: 'region' as const, region: annotation.region }
          : { kind: annotation.kind },
    })) as DatasetManifest['cases'],
  };
}

async function writeArtifacts(
  args: { flags: ReadonlyMap<string, string | true> },
  report: ReturnType<typeof evaluateCases>,
  runId: string,
): Promise<void> {
  const outDir = stringFlag(args, 'out');
  if (outDir === undefined) {
    return;
  }
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, `${runId}.report.json`), renderJsonReport(report));
  await writeFile(join(outDir, `${runId}.report.html`), renderHtmlReport(report));
}

function isDirectExecution(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) {
    return false;
  }
  try {
    return import.meta.url === pathToFileURL(entry).href;
  } catch {
    return false;
  }
}

if (isDirectExecution()) {
  const io = {
    stdout: (text: string) => process.stdout.write(`${text}\n`),
    stderr: (text: string) => process.stderr.write(`${text}\n`),
  };
  void (async () => {
    let code: number;
    try {
      code = await runCli(process.argv.slice(2), evalCommands, io);
    } catch {
      code = 2;
      io.stderr(`usage: npm run eval -- replay --bundle <path> --runner <profile> [--config <id>] [--out <dir>]\n       npm run eval -- compare --dataset <id> --configs <a,b>`);
    }
    process.exit(code);
  })();
}

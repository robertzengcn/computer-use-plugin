/**
 * Offline evaluation CLI (design §2.2 `npm run eval -- replay|compare`).
 * Replay and comparison are read-only, local and process-free: neither mode
 * can execute a recorded click or start a desktop backend (CU-PLUGIN-12).
 */
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
  IncompatibleConfigurationException,
  loadProfilesFromFile,
  loadTraceBundle,
  recordedRunner,
  syntheticRunner,
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

async function loadDataset(evalDir: string, datasetId: string): Promise<DatasetManifest> {
  const raw = await readFile(join(evalDir, 'datasets', datasetId, 'dataset.json'), 'utf8');
  const manifest = JSON.parse(raw) as DatasetManifest;
  if (manifest.schemaVersion !== 1) {
    throw new Error(`dataset ${datasetId}: unsupported schemaVersion ${manifest.schemaVersion}`);
  }
  return manifest;
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
      if (bundle === undefined || runnerName === undefined || datasetId === undefined) {
        return {
          outcome: 'invalidArgs',
          message: 'replay requires --bundle <path>, --runner <profile> and --dataset <id>',
        };
      }
      const profiles = await loadProfilesFromFile(join(process.cwd(), EVAL_DIR, 'runner', 'profiles.json'));
      const profile = profiles.get(runnerName);
      if (profile === undefined) {
        return { outcome: 'invalidArgs', message: `unknown runner profile '${runnerName}'` };
      }
      const dataset = await loadDataset(join(process.cwd(), EVAL_DIR), datasetId);
      const { manifest, records } = await loadTraceBundle(bundle);
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
        const run = recordedRunner(profile, records.map((record) => ({
          caseId: record.caseId,
          candidates: record.candidates,
          inferenceMs: record.inferenceMs,
          configuration: {
            modelConfigurationId: manifest.configuration.modelConfigurationId,
            adapterId: manifest.configuration.adapterId,
            adapterVersion: manifest.configuration.adapterVersion,
            preprocessingRevision: manifest.configuration.preprocessingRevision,
            decodingRevision: manifest.configuration.decodingRevision,
            calibrationRevision: manifest.configuration.calibrationRevision,
          },
        })));
        const expectedByCase = new Map(dataset.cases.map((entry) => [entry.id, entry.expected] as const));
        const inputs: EvalCaseInput[] = dataset.cases.map((entry) => ({
          caseId: entry.id,
          split: entry.split,
          consentClass: entry.consentClass,
          contentSha256: entry.contentSha256,
          expected: {
            kind: entry.expected.kind,
            region: 'region' in entry.expected ? entry.expected.region : undefined,
          },
        }));
        const outcomes = dataset.cases.map((entry) => {
          const result = run(entry.id);
          void expectedByCase;
          return {
            caseId: result.caseId,
            candidates: result.candidates.map((candidate) => candidate.point),
            inferenceMs: result.inferenceMs,
          };
        });
        const report = evaluateCases(
          inputs,
          outcomes,
          { mode: 'replay', datasetId, datasetVersion: `${dataset.version}+trace:${manifest.traceId}`, runnerKind: profile.kind },
          profile.configuration,
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
      const manifest = await loadDataset(join(process.cwd(), EVAL_DIR), datasetId);
      const inputs = datasetInputs(manifest);

      const reports = (selected as RunnerProfile[]).map((profile) => {
        const runner = syntheticRunner(profile);
        const outcomes = inputs.map((input) => {
          const expected = input.expected.kind === 'region' && input.expected.region
            ? { kind: 'region' as const, region: input.expected.region }
            : input.expected.kind === 'absent'
              ? { kind: 'absent' as const }
              : { kind: 'ambiguous' as const };
          const result = runner({ caseId: input.caseId, expected });
          return {
            caseId: result.caseId,
            candidates: result.candidates.map((candidate) => candidate.point),
            inferenceMs: result.inferenceMs,
          };
        });
        return evaluateCases(
          inputs,
          outcomes,
          { mode: 'compare', datasetId, datasetVersion: manifest.version, runnerKind: profile.kind },
          profile.configuration,
        );
      });

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

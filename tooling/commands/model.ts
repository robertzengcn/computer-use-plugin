/**
 * model:export / model:parity (design §2.2): gate on the models lock, then
 * drive the grounding pipeline through the bounded uv runner. The Python
 * pipeline decides staged success/failure; this wrapper only maps its exit
 * code to the CLI contract — export emits candidates, never a qualified
 * release.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildArgv, runProcess } from '../processes/run.js';
import type { CommandResult } from '../cli.js';

async function lockStatus(repoRoot: string): Promise<string> {
  const lock = JSON.parse(
    await readFile(join(repoRoot, 'grounding', 'models.lock.json'), 'utf8'),
  ) as { status?: string };
  return lock.status ?? 'malformed';
}

async function runPipeline(
  repoRoot: string,
  config: string,
  module: string,
  dataset?: string,
): Promise<CommandResult> {
  const status = await lockStatus(repoRoot);
  if (status !== 'approved') {
    return {
      outcome: 'missingPrerequisites',
      message: `grounding/models.lock.json status is '${status}': run the P0-D spike pin first; model:prepare fetches weights only after approval`,
    };
  }
  const extraArgs = dataset !== undefined ? ['--config', config, '--dataset', dataset] : ['--config', config];
  const result = await runProcess({
    argv: buildArgv({ kind: 'uv-python', project: 'grounding', module, extraArgs }),
    cwd: repoRoot,
    timeoutMs: 60 * 60_000,
  });
  if (result.outcome === 'cancelled') {
    return { outcome: 'cancelled', message: `pipeline ${module} timed out or was cancelled` };
  }
  // The pipeline returns 3 for prerequisites, 1 for staged qualification
  // failure, 0 for a candidate.
  const outcome = result.exitCode === 0 ? 'ok' : result.exitCode === 3 ? 'missingPrerequisites' : 'failed';
  return {
    outcome,
    message: result.stdout.trim().slice(-2000) || `pipeline ${module} exit ${result.exitCode}`,
    result: { exitCode: result.exitCode, stderr: result.stderr.slice(-500) },
  };
}

export function modelExport(repoRoot: string, config: string): Promise<CommandResult> {
  return runPipeline(repoRoot, config, 'aifetchly_grounding.export.pipeline');
}

export function modelParity(repoRoot: string, config: string, dataset: string | undefined): Promise<CommandResult> {
  if (dataset === undefined) {
    return Promise.resolve({
      outcome: 'invalidArgs',
      message: 'model:parity requires --dataset <id> (the frozen tolerance profile is per dataset)',
    });
  }
  // The dataset routes through to the pipeline so the emitted report carries
  // the exact dataset identity it evaluated (B15).
  return runPipeline(repoRoot, config, 'aifetchly_grounding.export.pipeline', dataset);
}

/**
 * Evaluation report assembly and rendering (design §8.4). Every case records
 * fixture identity, expected/actual geometry, timings and an explicit
 * pass/fail/skipped reason; an empty executed set or a skipped required case
 * can never pass a release gate (CU-PLUGIN-19).
 */
import { absenceFalseAccepts, latencySummary, regionHit, type Point, type Region } from './metrics/hits.js';
import type { RunnerConfiguration } from './runner/runners.js';

export type CaseStatus = 'pass' | 'fail' | 'skipped';

export interface ExpectedOutcome {
  readonly kind: 'region' | 'absent' | 'ambiguous';
  readonly region?: Region | undefined;
}

export interface EvalCaseInput {
  readonly caseId: string;
  readonly split: 'regression' | 'calibration' | 'held_out';
  readonly consentClass: 'synthetic' | 'reviewed';
  readonly contentSha256?: string | undefined;
  readonly expected: ExpectedOutcome;
}

export interface EvalCaseOutcome {
  readonly caseId: string;
  readonly candidates: readonly Point[];
  readonly inferenceMs: number;
}

export interface ReportCaseRecord {
  readonly caseId: string;
  readonly split: string;
  readonly fixtureHash: string;
  readonly expected: string;
  readonly actual: string;
  readonly regionHit: boolean | null;
  readonly status: CaseStatus;
  readonly reason: string;
  readonly inferenceMs: number;
}

export interface ReportAggregate {
  readonly planned: number;
  readonly executed: number;
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
  readonly regionHitRate: number | null;
  readonly absenceFalseAccepts: number;
  readonly latency: { readonly p50: number; readonly p95: number; readonly max: number } | null;
}

export interface EvaluationReport {
  readonly schema: 'computer-use-eval-report-v1';
  readonly run: {
    readonly mode: 'replay' | 'compare';
    readonly datasetId: string;
    readonly datasetVersion: string;
    readonly runnerKind: string;
    readonly runnerLabel: string;
  };
  readonly configuration: RunnerConfiguration;
  readonly cases: readonly ReportCaseRecord[];
  readonly aggregate: ReportAggregate;
  readonly qualification: {
    readonly missingEvidence: readonly string[];
    readonly producerOnly: true;
  };
}

const RUNNER_LABELS: Record<string, string> = {
  recorded: 'recorded-evidence (not a model accuracy measurement)',
  synthetic: 'synthetic-deterministic stub (tooling exercise only, not model accuracy)',
};

export function evaluateCases(
  inputs: readonly EvalCaseInput[],
  outcomes: readonly EvalCaseOutcome[],
  run: { mode: 'replay' | 'compare'; datasetId: string; datasetVersion: string; runnerKind: string },
  configuration: RunnerConfiguration,
): EvaluationReport {
  const outcomeByCase = new Map(outcomes.map((outcome) => [outcome.caseId, outcome] as const));
  const caseRecords: ReportCaseRecord[] = inputs.map((input) => {
    const outcome = outcomeByCase.get(input.caseId);
    if (outcome === undefined) {
      return {
        caseId: input.caseId,
        split: input.split,
        fixtureHash: input.contentSha256 ?? 'unversioned',
        expected: input.expected.kind,
        actual: 'no-result',
        regionHit: null,
        status: 'skipped' as CaseStatus,
        reason: 'required case produced no result; skipped is not a pass',
        inferenceMs: 0,
      };
    }
    if (input.expected.kind === 'region' && input.expected.region) {
      const hit = regionHit(outcome.candidates, input.expected.region);
      return {
        caseId: input.caseId,
        split: input.split,
        fixtureHash: input.contentSha256 ?? 'unversioned',
        expected: `region ${JSON.stringify(input.expected.region)}`,
        actual: `candidates ${JSON.stringify(outcome.candidates)}`,
        regionHit: hit,
        status: hit ? ('pass' as CaseStatus) : ('fail' as CaseStatus),
        reason: hit ? 'candidate inside labeled region' : 'no candidate inside labeled region',
        inferenceMs: outcome.inferenceMs,
      };
    }
    if (input.expected.kind === 'absent') {
      const falseAccept = outcome.candidates.length > 0;
      return {
        caseId: input.caseId,
        split: input.split,
        fixtureHash: input.contentSha256 ?? 'unversioned',
        expected: 'absent',
        actual: `${outcome.candidates.length} candidate(s)`,
        regionHit: null,
        status: falseAccept ? ('fail' as CaseStatus) : ('pass' as CaseStatus),
        reason: falseAccept
          ? 'candidate accepted on an absent target — forbidden recovery (PRD §6.1)'
          : 'no candidate accepted for absent target',
        inferenceMs: outcome.inferenceMs,
      };
    }
    return {
      caseId: input.caseId,
      split: input.split,
      fixtureHash: input.contentSha256 ?? 'unversioned',
      expected: 'ambiguous',
      actual: `${outcome.candidates.length} candidate(s)`,
      regionHit: null,
      status: outcome.candidates.length === 0 ? ('pass' as CaseStatus) : ('fail' as CaseStatus),
      reason:
        outcome.candidates.length === 0
          ? 'ambiguous target returned no forced candidate'
          : 'ambiguous target returned a forced candidate',
      inferenceMs: outcome.inferenceMs,
    };
  });

  const executed = caseRecords.filter((record) => record.status !== 'skipped');
  const regionCases = caseRecords.filter((record) => record.regionHit !== null);
  const absentOutcomes = inputs
    .filter((input) => input.expected.kind === 'absent')
    .map((input) => outcomeByCase.get(input.caseId)?.candidates ?? []);
  const latencies = executed.map((record) => record.inferenceMs);

  const missingEvidence: string[] = [];
  if (executed.length === 0) {
    missingEvidence.push('no cases executed; an empty set cannot pass a release gate');
  }
  for (const record of caseRecords.filter((entry) => entry.status === 'skipped')) {
    missingEvidence.push(`case ${record.caseId} skipped: ${record.reason}`);
  }

  const report: EvaluationReport = {
    schema: 'computer-use-eval-report-v1',
    run: {
      ...run,
      runnerLabel: RUNNER_LABELS[run.runnerKind] ?? run.runnerKind,
    },
    configuration,
    cases: caseRecords,
    aggregate: {
      planned: inputs.length,
      executed: executed.length,
      passed: caseRecords.filter((record) => record.status === 'pass').length,
      failed: caseRecords.filter((record) => record.status === 'fail').length,
      skipped: caseRecords.filter((record) => record.status === 'skipped').length,
      regionHitRate:
        regionCases.length > 0
          ? regionCases.filter((record) => record.regionHit === true).length / regionCases.length
          : null,
      absenceFalseAccepts: absenceFalseAccepts(absentOutcomes),
      latency: latencies.length > 0 ? latencySummary(latencies) : null,
    },
    qualification: {
      missingEvidence,
      producerOnly: true,
    },
  };
  return report;
}

export function renderJsonReport(report: EvaluationReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function renderHtmlReport(report: EvaluationReport): string {
  const rows = report.cases
    .map(
      (record) =>
        `<tr><td>${record.caseId}</td><td>${record.split}</td><td>${record.status}</td><td>${record.regionHit ?? '—'}</td><td>${record.inferenceMs}</td><td>${escapeHtml(record.reason)}</td></tr>`,
    )
    .join('\n');
  const aggregate = report.aggregate;
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Eval report ${report.run.datasetId}</title>
<style>body{font-family:system-ui,sans-serif;margin:2rem}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px 8px;font-size:14px}</style>
</head><body>
<h1>Computer Use evaluation report</h1>
<p>dataset <b>${report.run.datasetId}</b> v${report.run.datasetVersion} — mode ${report.run.mode} — runner ${report.run.runnerLabel}</p>
<p>model configuration <code>${report.configuration.modelConfigurationId}</code> (prep ${report.configuration.preprocessingRevision}, decode ${report.configuration.decodingRevision}, cal ${report.configuration.calibrationRevision})</p>
<p>planned ${aggregate.planned} · executed ${aggregate.executed} · passed ${aggregate.passed} · failed ${aggregate.failed} · skipped ${aggregate.skipped} · region-hit ${aggregate.regionHitRate ?? '—'} · absence false-accepts ${aggregate.absenceFalseAccepts}</p>
<table><tr><th>case</th><th>split</th><th>status</th><th>hit</th><th>ms</th><th>reason</th></tr>
${rows}
</table>
${report.qualification.missingEvidence.length > 0 ? `<h2>Missing evidence</h2><ul>${report.qualification.missingEvidence.map((entry) => `<li>${escapeHtml(entry)}</li>`).join('')}</ul>` : ''}
</body></html>
`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function reportPasses(report: EvaluationReport): boolean {
  return (
    report.qualification.missingEvidence.length === 0 && report.aggregate.failed === 0
  );
}

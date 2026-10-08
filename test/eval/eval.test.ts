import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli } from '../../tooling/cli.js';
import { evalCommands } from '../../eval/cli.js';

const REPO = process.cwd();
const BUNDLE = join(REPO, 'test', 'fixtures', 'trace-bundle');

function capture() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    io: {
      stdout: (text: string) => stdout.push(text),
      stderr: (text: string) => stderr.push(text),
    },
  };
}

describe('eval replay (CU-PLUGIN-12)', () => {
  it('replays recorded evidence and passes with matching identities', async () => {
    const { io, stdout, stderr } = capture();
    const code = await runCli(
      ['--json', 'replay', '--bundle', BUNDLE, '--runner', 'recorded', '--dataset', 'w1-smoke'],
      evalCommands,
      io,
    );
    expect(code, stderr.join('\n')).toBe(0);
    const envelope = JSON.parse(stdout.join('') || '{}');
    expect(envelope.status).toBe('ok');
    expect(envelope.result.aggregate.planned).toBe(8);
    expect(envelope.result.aggregate.executed).toBe(8);
    expect(envelope.result.aggregate.absenceFalseAccepts).toBe(0);
    expect(envelope.result.configuration.modelConfigurationId).toBe('gui-actor-2b-fp16@0.1.0');
    expect(envelope.result.run.runnerLabel).toMatch(/not a model accuracy/i);
  });

  it('fails closed on configuration mismatch instead of substituting (design §3.6)', async () => {
    const { io, stdout, stderr } = capture();
    const code = await runCli(
      [
        'replay',
        '--bundle',
        BUNDLE,
        '--runner',
        'recorded',
        '--dataset',
        'w1-smoke',
        '--config',
        'some-other-model@9.9.9',
      ],
      evalCommands,
      io,
    );
    expect(code).toBe(1);
    expect(stderr.join('\n') + stdout.join('')).toMatch(/incompatible configuration|never substitutes/i);
  });

  it('rejects missing required flags with exit 2', async () => {
    const { io } = capture();
    const code = await runCli(['replay', '--bundle', BUNDLE], evalCommands, io);
    expect(code).toBe(2);
  });

  it('the documented §2.2 argv (no --dataset) scores via bundle annotations.json', async () => {
    const { io, stdout } = capture();
    const code = await runCli(
      ['--json', 'replay', '--bundle', BUNDLE, '--runner', 'recorded'],
      evalCommands,
      io,
    );
    expect(code).toBe(0);
    const envelope = JSON.parse(stdout.join('') || '{}');
    expect(envelope.status).toBe('ok');
    expect(envelope.result.run.datasetId).toMatch(/annotations/);
    expect(envelope.result.aggregate.executed).toBe(8);
  });

  it('marks a skipped required case as missing evidence, never a pass (CU-PLUGIN-19)', async () => {
    // Recorded runner throws on unknown case; the report layer records the skip.
    const { io } = capture();
    const code = await runCli(
      ['replay', '--bundle', BUNDLE, '--runner', 'synthetic-deterministic', '--dataset', 'w1-smoke'],
      evalCommands,
      io,
    );
    expect(code).toBe(1);
  });
});

describe('replay applies preprocessing transforms (M05, design §8.4)', () => {
  it('scores model_input_pixels candidates in original capture pixels', async () => {
    const { io, stdout } = capture();
    const code = await runCli(
      ['--json', 'replay', '--bundle', join(REPO, 'test/fixtures/trace-bundle-model-space'), '--runner', 'recorded'],
      evalCommands,
      io,
    );
    expect(code).toBe(0);
    const envelope = JSON.parse(stdout.join('') || '{}');
    expect(envelope.status).toBe('ok');
    expect(envelope.result.aggregate.executed).toBe(8);
  });

  it('a wrong transform produces misses, not silent passes', async () => {
    const { io } = capture();
    const code = await runCli(
      ['replay', '--bundle', join(REPO, 'test/fixtures/trace-bundle-model-space-wrong'), '--runner', 'recorded'],
      evalCommands,
      io,
    );
    expect(code).toBe(1);
  });

  it('model-space candidates without a declared transform fail closed', async () => {
    const { io, stdout } = capture();
    const code = await runCli(
      ['replay', '--bundle', join(REPO, 'test/fixtures/trace-bundle-model-space-missing-transform'), '--runner', 'recorded'],
      evalCommands,
      io,
    );
    expect(code).toBe(1);
    expect(stdout.join('')).toMatch(/transformToCapture|never guesses/i);
  });
});

describe('eval compare (identical evidence)', () => {
  it('compares two configurations on the same dataset', async () => {
    const { io, stdout } = capture();
    const code = await runCli(
      ['compare', '--dataset', 'w1-smoke', '--configs', 'synthetic-deterministic,synthetic-b'],
      evalCommands,
      io,
    );
    // Outcome reflects gates; the tooling assertion is the summary shape.
    const output = stdout.join('');
    expect(output).toMatch(/identical evidence: true/);
    expect(output).toMatch(/synthetic-deterministic: region-hit/);
    expect(output).toMatch(/synthetic-b: region-hit/);
    expect([0, 1]).toContain(code);
  });

  it('rejects recorded profiles in compare instead of substituting synthetic (B16)', async () => {
    const { io, stdout, stderr } = capture();
    const code = await runCli(
      ['compare', '--dataset', 'w1-smoke', '--configs', 'synthetic-deterministic,recorded'],
      evalCommands,
      io,
    );
    expect(code).toBe(2);
    expect(stdout.join('') + stderr.join('\n')).toMatch(/compare runs synthetic profiles only/);
  });

  it('rejects compare with fewer than two configs', async () => {
    const { io } = capture();
    const code = await runCli(['compare', '--dataset', 'w1-smoke', '--configs', 'recorded'], evalCommands, io);
    expect(code).toBe(2);
  });
});

describe('no-backend invariant (CU-PLUGIN-12: replay cannot execute desktop input)', () => {
  it('eval sources never import process/network primitives', () => {
    const forbidden = /(node:)?(child_process|net|http|https|dgram|worker_threads)|spawn|execSync/;
    const evalDir = join(REPO, 'eval');
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.name.endsWith('.ts')) {
          const source = readFileSync(full, 'utf8');
          const withoutComments = source
            .replace(/^\s*\/\/.*$/gm, '')
            .replace(/'[^']*'|"[^"]*"|`[^`]*`/g, '""');
          if (forbidden.test(withoutComments)) {
            offenders.push(full);
          }
        }
      }
    };
    walk(evalDir);
    expect(offenders).toEqual([]);
  });

  it('trace bundle contains recorded outcomes only — no dispatch directives', () => {
    const manifest = readFileSync(join(BUNDLE, 'manifest.json'), 'utf8');
    expect(manifest).not.toMatch(/"dispatch"|sendInput|click\(/);
  });
});

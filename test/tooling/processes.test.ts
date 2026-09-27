import { describe, expect, it } from 'vitest';
import { buildArgv, runProcess } from '../../tooling/processes/run.js';

const NODE = process.execPath;

describe('runProcess', () => {
  it('passes argv with shell:false — spaced arguments arrive intact', async () => {
    const result = await runProcess({
      argv: [NODE, '-e', 'process.stdout.write(JSON.stringify(process.argv.slice(1)))', 'a b', 'c'],
    });
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(['a b', 'c']);
    expect(result.timedOut).toBe(false);
  });

  it('captures stdout and stderr separately', async () => {
    const result = await runProcess({
      argv: [NODE, '-e', 'process.stdout.write("out"); process.stderr.write("err")'],
    });
    expect(result.stdout).toBe('out');
    expect(result.stderr).toBe('err');
  });

  it('surfaces a non-zero exit code', async () => {
    const result = await runProcess({ argv: [NODE, '-e', 'process.exit(7)'] });
    expect(result.exitCode).toBe(7);
    expect(result.outcome).toBe('failed');
  });

  it('reports ENOENT as a typed spawn error', async () => {
    await expect(
      runProcess({ argv: ['/nonexistent/binary-xyz', '--flag'] }),
    ).rejects.toThrow(/spawn|ENOENT/i);
  });

  it('kills a child that exceeds timeoutMs and reports timedOut', async () => {
    const result = await runProcess({
      argv: [NODE, '-e', 'setInterval(() => {}, 50)'],
      timeoutMs: 500,
      killGraceMs: 100,
    });
    expect(result.timedOut).toBe(true);
    expect(result.outcome).toBe('cancelled');
    expect(result.exitCode).not.toBe(0);
  });

  it('honours an AbortSignal for cancellation', async () => {
    const controller = new AbortController();
    const pending = runProcess({
      argv: [NODE, '-e', 'setInterval(() => {}, 50)'],
      signal: controller.signal,
      killGraceMs: 100,
    });
    setTimeout(() => controller.abort(), 150);
    const result = await pending;
    expect(result.timedOut).toBe(false);
    expect(result.cancelled).toBe(true);
    expect(result.outcome).toBe('cancelled');
  });

  it('truncates output beyond maxOutputBytes and flags it', async () => {
    const result = await runProcess({
      argv: [NODE, '-e', "process.stdout.write('x'.repeat(10_000))"],
      maxOutputBytes: 1_000,
    });
    expect(result.stdout.length).toBe(1_000);
    expect(result.truncated).toBe(true);
  });

  it('records durationMs for completed runs', async () => {
    const result = await runProcess({ argv: [NODE, '-e', ''] });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.outcome).toBe('ok');
  });
});

describe('buildArgv', () => {
  it('joins a python module invocation the §2.2 way', () => {
    expect(buildArgv({ kind: 'uv-python', project: 'grounding', module: 'aifetchly_grounding.parity' })).toEqual([
      'uv',
      'run',
      '--locked',
      '--project',
      'grounding',
      'python',
      '-m',
      'aifetchly_grounding.parity',
    ]);
  });

  it('rejects module names that look like flags or paths (injection guard)', () => {
    expect(() =>
      buildArgv({ kind: 'uv-python', project: 'grounding', module: '--help' }),
    ).toThrow(/invalid module/i);
    expect(() =>
      buildArgv({ kind: 'uv-python', project: '../escape', module: 'a.m' }),
    ).toThrow(/invalid project/i);
  });
});

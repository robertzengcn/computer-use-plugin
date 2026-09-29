import { describe, expect, it } from 'vitest';
import { runCli } from '../../tooling/cli.js';
import { COMMANDS, commandByName } from '../../tooling/commands.js';

function ioCapture(): { io: { stdout: (t: string) => void; stderr: (t: string) => void }; stdout: string[]; stderr: string[] } {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    io: { stdout: (t: string) => stdout.push(t), stderr: (t: string) => stderr.push(t) },
  };
}

describe('command dispatch through runCli', () => {
  it.each([
    ['backend:prepare', ['--target', 'win32-x64'], 3],
    ['backend:prepare', ['--target', 'darwin-arm64'], 3],
    ['backend:prepare', ['--target', 'linux-x64'], 2],
    ['backend:prepare', [], 3],
    ['backend:test', ['--target', 'win32-x64', '--suite', 'unit'], 3],
    ['backend:test', ['--target', 'made-up'], 2],
    ['model:prepare', [], 3],
    ['model:export', ['--config', 'gui-actor-2b-fp16'], 3],
    ['model:parity', ['--config', 'gui-actor-2b-fp16', '--dataset', 'w1-smoke'], 3],
    ['package:build', ['--target', 'win32-x64'], 3],
    ['package:build', [], 3],
  ])('%s %j exits %i', async (command, extra, expected) => {
    const { io, stdout, stderr } = ioCapture();
    const code = await runCli([command, ...extra], COMMANDS, io);
    expect(code, `${stdout.join('')}${stderr.join('')}`).toBe(expected);
  });

  it('darwin target on linux names the required platform', async () => {
    const { io, stdout } = ioCapture();
    const code = await runCli(['backend:prepare', '--target', 'darwin-arm64'], COMMANDS, io);
    expect(code).toBe(3);
    expect(stdout.join('')).toMatch(/darwin/i);
  });

  it('spike-pending messages reference the phase or prerequisite', async () => {
    const { io, stdout } = ioCapture();
    await runCli(['model:export', '--config', 'x'], COMMANDS, io);
    expect(stdout.join('')).toMatch(/model:prepare|weights|Phase 0 spike/i);
  });

  it('unknown command prints usage and exits 2', async () => {
    const { io, stderr } = ioCapture();
    const code = await runCli(['bogus:command'], COMMANDS, io);
    expect(code).toBe(2);
    expect(stderr.join('\n')).toMatch(/Usage:/);
    expect(stderr.join('\n')).toMatch(/unknown command 'bogus:command'/);
  });

  it('empty argv exits 2 with usage', async () => {
    const { io, stderr } = ioCapture();
    expect(await runCli([], COMMANDS, io)).toBe(2);
    expect(stderr.join('\n')).toMatch(/Usage:/);
  });

  it('contracts:build as a command produces the archive envelope', async () => {
    const { io, stdout } = ioCapture();
    const code = await runCli(['contracts:build'], COMMANDS, io);
    expect(code).toBe(0);
    expect(stdout.join('')).toMatch(/contracts archive v1: \d+ files/);
  });

  it('release:verify command fails on a bad manifest with exit 1', async () => {
    const { io, stdout } = ioCapture();
    const code = await runCli(
      ['release:verify', '--manifest', 'test/fixtures/release/bad-hash/release.json'],
      COMMANDS,
      io,
    );
    expect(code).toBe(1);
    expect(stdout.join('')).toMatch(/FAIL \[hash\]/);
  });

  it('release:verify without --manifest exits 2', async () => {
    const { io } = ioCapture();
    expect(await runCli(['release:verify'], COMMANDS, io)).toBe(2);
  });

  it('a throwing handler is reported as failed, not a crash', async () => {
    const boom = commandByName('contracts:check');
    if (!boom) throw new Error('missing');
    const original = boom.handler;
    (boom as { handler: typeof original }).handler = async () => {
      throw new Error('kaboom');
    };
    const { io, stderr, stdout } = ioCapture();
    const code = await runCli(['contracts:check'], COMMANDS, io);
    (boom as { handler: typeof original }).handler = original;
    expect(code).toBe(1);
    expect(stderr.join('')).toMatch(/kaboom/);
    expect(stdout.join('')).toBe('');
  });

  it('--json envelope carries the failing status', async () => {
    const { io, stdout } = ioCapture();
    const code = await runCli(
      ['--json', 'release:verify', '--manifest', 'test/fixtures/release/missing-evidence/release.json'],
      COMMANDS,
      io,
    );
    expect(code).toBe(1);
    const envelope = JSON.parse(stdout.join('') || '{}');
    expect(envelope.status).toBe('failed');
    expect(envelope.errors?.[0]).toMatch(/required suite 'parity'/);
  });
});

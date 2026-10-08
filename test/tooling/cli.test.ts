import { describe, expect, it } from 'vitest';
import {
  EXIT_CODES,
  buildJsonEnvelope,
  formatUsage,
  parseArgs,
  type CliOutcome,
} from '../../tooling/cli.js';
import { COMMANDS, commandByName } from '../../tooling/commands.js';

describe('parseArgs', () => {
  it.each([
    [
      ['replay', '--bundle', 'x', '--runner', 'recorded'],
      { positionals: ['replay'], flags: new Map([['bundle', 'x'], ['runner', 'recorded']]) },
    ],
    [
      ['--json', 'contracts:check'],
      { positionals: ['contracts:check'], flags: new Map([['json', true]]) },
    ],
    [
      ['compare', '--configs', 'a,b'],
      { positionals: ['compare'], flags: new Map([['configs', 'a,b']]) },
    ],
  ])('parses %j', (argv, expected) => {
    expect(parseArgs(argv)).toEqual(expected);
  });

  it('treats a value beginning with -- as a flag name, not a value', () => {
    const parsed = parseArgs(['cmd', '--flag', '--other']);
    expect(parsed.flags.get('flag')).toBe(true);
    expect(parsed.positionals).toEqual(['cmd']);
  });

  it('rejects empty argv and flags without a leading dash', () => {
    expect(() => parseArgs([])).toThrow();
    expect(() => parseArgs(['cmd', 'bare'])).toThrow(/invalid argument/i);
  });
});

describe('exit code contract (design §2.2)', () => {
  it('maps outcomes to 0/1/2/3/4', () => {
    const expected: Record<CliOutcome, number> = {
      ok: 0,
      failed: 1,
      invalidArgs: 2,
      missingPrerequisites: 3,
      cancelled: 4,
    };
    expect(EXIT_CODES).toEqual(expected);
  });
});

describe('json envelope', () => {
  it('includes status, command and optional result/errors', () => {
    expect(buildJsonEnvelope({ status: 'ok', command: 'contracts:check' })).toEqual({
      status: 'ok',
      command: 'contracts:check',
    });
    expect(
      buildJsonEnvelope({ status: 'failed', command: 'x', errors: ['a', 'b'] }),
    ).toEqual({ status: 'failed', command: 'x', errors: ['a', 'b'] });
  });

  it('omits undefined result and errors keys entirely (exactOptionalPropertyTypes)', () => {
    const envelope = buildJsonEnvelope({ status: 'ok', command: 'c', result: undefined });
    expect(Object.keys(envelope).sort()).toEqual(['command', 'status']);
  });
});

describe('command registry', () => {
  it('registers every §2.2 developer command', () => {
    const names = COMMANDS.map((c) => c.name).sort();
    expect(names).toEqual(
      [
        'backend:prepare',
        'backend:test',
        'contracts:build',
        'contracts:check',
        'model:export',
        'model:parity',
        'model:prepare',
        'package:build',
        'release:assemble',
        'release:verify',
      ].sort(),
    );
  });

  it('every command has a non-empty summary for usage text', () => {
    for (const command of COMMANDS) {
      expect(command.summary.length).toBeGreaterThan(10);
    }
  });

  it('lookup by name returns the same registry entries', () => {
    expect(commandByName('contracts:check')?.name).toBe('contracts:check');
    expect(commandByName('does-not-exist')).toBeUndefined();
  });

  it('backend commands fail closed with missingPrerequisites on non-Windows hosts', async () => {
    const prepare = commandByName('backend:prepare');
    if (!prepare) throw new Error('missing command');
    const result = await prepare.handler(
      { positionals: [], flags: new Map([['target', 'win32-x64']]) },
      { cwd: process.cwd() },
    );
    expect(result.outcome).toBe('missingPrerequisites');
    expect(result.message).toMatch(/win32-x64|Windows/i);
  });

  it('model commands fail closed while weights/toolchain are not fetched', async () => {
    const exportCommand = commandByName('model:export');
    if (!exportCommand) throw new Error('missing command');
    const result = await exportCommand.handler(
      { positionals: [], flags: new Map([['config', 'gui-actor-2b-fp16']]) },
      { cwd: process.cwd() },
    );
    expect(result.outcome).toBe('missingPrerequisites');
    expect(result.message).toMatch(/model:prepare|weights|spike/i);
  });
});

describe('usage', () => {
  it('lists every registered command', () => {
    const usage = formatUsage(COMMANDS);
    for (const command of COMMANDS) {
      expect(usage).toContain(command.name);
    }
  });
});

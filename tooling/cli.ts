/**
 * Shared command-line plumbing for every developer command in design §2.2.
 *
 * Exit-code contract: 0 completed checks, 1 test/evaluation/gate failure,
 * 2 invalid arguments/schema, 3 missing prerequisites or incompatible
 * configuration, 4 cancelled work. In JSON mode stdout carries exactly one
 * structured result and diagnostics go to stderr.
 */
import { pathToFileURL } from 'node:url';
import { EXIT_CODES, type CliOutcome } from './exit-codes.js';
import { parseArgs, type ParsedArgs } from './parse-args.js';

export { EXIT_CODES };
export type { CliOutcome };
export { parseArgs };
export type { ParsedArgs };

/** A registered developer command (see tooling/commands.ts). */
export interface CommandSpec {
  readonly name: string;
  readonly summary: string;
  readonly handler: (args: ParsedArgs, ctx: CommandContext) => Promise<CommandResult>;
}

export interface CommandContext {
  readonly cwd: string;
}

export interface CommandResult {
  readonly outcome: CliOutcome;
  readonly message?: string;
  readonly result?: unknown;
}

export interface CliIo {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
}

export interface JsonEnvelope {
  readonly status: CliOutcome;
  readonly command: string;
  readonly result?: unknown;
  readonly errors?: readonly string[];
}

export function buildJsonEnvelope(input: {
  status: CliOutcome;
  command: string;
  result?: unknown | undefined;
  errors?: readonly string[] | undefined;
}): JsonEnvelope {
  const envelope: {
    status: CliOutcome;
    command: string;
    result?: unknown;
    errors?: readonly string[];
  } = { status: input.status, command: input.command };
  if (input.result !== undefined) {
    envelope.result = input.result;
  }
  if (input.errors !== undefined && input.errors.length > 0) {
    envelope.errors = input.errors;
  }
  return envelope;
}

export function formatUsage(commands: readonly CommandSpec[]): string {
  const lines = ['Usage: <cli> <command> [--flag value ...]', '', 'Commands:'];
  for (const command of commands) {
    lines.push(`  ${command.name.padEnd(20)} ${command.summary}`);
  }
  lines.push('', 'Offline commands never touch a desktop; --allow-input native tests are separate.');
  return lines.join('\n');
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

/** Runs one command; returns the process exit code per the §2.2 contract. */
export async function runCli(
  argv: readonly string[],
  commands: readonly CommandSpec[],
  io: CliIo,
): Promise<number> {
  let args: ParsedArgs;
  try {
    args = parseArgs(argv);
  } catch (error) {
    io.stderr(formatUsage(commands));
    io.stderr(`error: ${errorMessage(error)}`);
    return EXIT_CODES.invalidArgs;
  }

  const requested = args.positionals[0];
  if (requested === undefined) {
    io.stderr(formatUsage(commands));
    return EXIT_CODES.invalidArgs;
  }
  const command = commands.find((c) => c.name === requested);
  if (!command) {
    io.stderr(formatUsage(commands));
    io.stderr(`error: unknown command '${requested}'`);
    return EXIT_CODES.invalidArgs;
  }

  try {
    const outcome = await command.handler(args, { cwd: process.cwd() });
    if (args.flags.get('json') === true) {
      io.stdout(
        JSON.stringify(
          buildJsonEnvelope({
            status: outcome.outcome,
            command: command.name,
            result: outcome.result,
            errors: outcome.message ? [outcome.message] : undefined,
          }),
        ),
      );
    } else if (outcome.message !== undefined) {
      io.stdout(outcome.message);
    }
    return EXIT_CODES[outcome.outcome];
  } catch (error) {
    io.stderr(`error: ${errorMessage(error)}`);
    if (args.flags.get('json') === true) {
      io.stdout(
        JSON.stringify(
          buildJsonEnvelope({
            status: 'failed',
            command: command.name,
            errors: [errorMessage(error)],
          }),
        ),
      );
    }
    return EXIT_CODES.failed;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function main(): Promise<void> {
  const code = await runCli(
    process.argv.slice(2),
    (await import('./commands.js')).COMMANDS,
    { stdout: (t) => process.stdout.write(`${t}\n`), stderr: (t) => process.stderr.write(`${t}\n`) },
  );
  process.exit(code);
}

if (isDirectExecution()) {
  void main();
}

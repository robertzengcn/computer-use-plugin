/** Strict argv parsing: at most one subcommand positional plus --flag [value] options. */
export interface ParsedArgs {
  readonly positionals: readonly string[];
  readonly flags: ReadonlyMap<string, string | true>;
}

/** Flags that never consume the following token as a value. */
export const DEFAULT_BOOLEAN_FLAGS: ReadonlySet<string> = new Set(['json', 'allow-input', 'help']);

export class InvalidArgumentsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidArgumentsError';
  }
}

export function parseArgs(
  argv: readonly string[],
  booleanFlags: ReadonlySet<string> = DEFAULT_BOOLEAN_FLAGS,
): ParsedArgs {
  if (argv.length === 0) {
    throw new InvalidArgumentsError('no command given');
  }
  const positionals: string[] = [];
  const flags = new Map<string, string | true>();
  let index = 0;
  while (index < argv.length) {
    const token = argv[index];
    if (token === undefined) {
      break;
    }
    if (token.startsWith('--')) {
      const name = token.slice(2);
      if (name.length === 0) {
        throw new InvalidArgumentsError(`invalid argument '${token}'`);
      }
      const next = argv[index + 1];
      if (
        next !== undefined &&
        !next.startsWith('--') &&
        !booleanFlags.has(name)
      ) {
        flags.set(name, next);
        index += 2;
      } else {
        flags.set(name, true);
        index += 1;
      }
      continue;
    }
    if (token.startsWith('-')) {
      throw new InvalidArgumentsError(
        `invalid argument '${token}': only --flag options are supported`,
      );
    }
    if (positionals.length >= 1) {
      throw new InvalidArgumentsError(
        `invalid argument '${token}': at most one subcommand is allowed`,
      );
    }
    positionals.push(token);
    index += 1;
  }
  return { positionals, flags };
}

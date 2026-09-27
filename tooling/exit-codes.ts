/** Exit-code contract from design §2.2. Shared by every CLI entry point. */
export type CliOutcome =
  | 'ok'
  | 'failed'
  | 'invalidArgs'
  | 'missingPrerequisites'
  | 'cancelled';

export const EXIT_CODES: Readonly<Record<CliOutcome, number>> = Object.freeze({
  ok: 0,
  failed: 1,
  invalidArgs: 2,
  missingPrerequisites: 3,
  cancelled: 4,
});

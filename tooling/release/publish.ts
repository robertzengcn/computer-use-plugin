/**
 * Recoverable publication for build outputs (N08): staged directories are
 * unique per call (concurrent-run safe) and the final swap never deletes
 * the previous candidate before its replacement is in place. A failed
 * final rename restores the backup instead of leaving no output.
 */
import { rename, rm, stat } from 'node:fs/promises';

export interface PublishOps {
  readonly rename: (from: string, to: string) => Promise<void>;
  readonly rm: (path: string) => Promise<void>;
  readonly exists: (path: string) => Promise<boolean>;
}

export const defaultPublishOps: PublishOps = {
  rename: (from, to) => rename(from, to),
  rm: (path) => rm(path, { recursive: true, force: true }).then(() => undefined),
  exists: (path) => stat(path).then(() => true, () => false),
};

let stagingCounter = 0;

/** Unique staging directory beside `finalDir` (concurrent runs never share). */
export function stagingFor(finalDir: string): string {
  stagingCounter += 1;
  return `${finalDir}.staging-${process.pid}-${stagingCounter}`;
}

/** Unique temp file beside `finalPath` (same uniqueness as stagingFor). */
export function tempFor(finalPath: string, tag: string): string {
  stagingCounter += 1;
  return `${finalPath}.${tag}-${process.pid}-${stagingCounter}`;
}

/** Unique backup directory beside `finalDir` (same-ms concurrent runs). */
function backupFor(finalDir: string): string {
  stagingCounter += 1;
  return `${finalDir}.backup-${process.pid}-${Date.now()}-${stagingCounter}`;
}

export type PublishResult = { readonly outcome: 'ok' } | { readonly outcome: 'failed'; readonly message: string };

/**
 * Publish `stagingDir` as `finalDir` with backup/restore:
 * final → backup, staging → final, then drop the backup. Any rename
 * failure preserves the previous complete directory and retains staging
 * for inspection.
 */
export async function publishStaging(
  stagingDir: string,
  finalDir: string,
  ops: PublishOps = defaultPublishOps,
): Promise<PublishResult> {
  const backupDir = backupFor(finalDir);
  const finalExists = await ops.exists(finalDir);
  if (finalExists) {
    try {
      await ops.rename(finalDir, backupDir);
    } catch (error) {
      return {
        outcome: 'failed',
        message: `publish failed before replacing ${finalDir}: ${(error as Error).message} — previous candidate preserved, staging retained at ${stagingDir}`,
      };
    }
  }
  try {
    await ops.rename(stagingDir, finalDir);
  } catch (error) {
    if (finalExists) {
      // The restore itself can fail — report its outcome honestly instead
      // of claiming a restore that never happened.
      const restored = await ops.rename(backupDir, finalDir).then(() => true, () => false);
      if (!restored) {
        return {
          outcome: 'failed',
          message: `publish failed while installing ${finalDir}: ${(error as Error).message} — restore also failed; previous candidate survives at ${backupDir}, staging retained at ${stagingDir}`,
        };
      }
    }
    return {
      outcome: 'failed',
      message: `publish failed while installing ${finalDir}: ${(error as Error).message} — previous candidate restored, staging retained at ${stagingDir}`,
    };
  }
  if (finalExists) {
    await ops.rm(backupDir).catch(() => undefined);
  }
  return { outcome: 'ok' };
}

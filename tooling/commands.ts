/**
 * Registry of every §2.2 developer command. Platform-bound commands
 * (backend:*, model:*, package:build) fail closed with `missingPrerequisites`
 * until the Phase 0 spikes pin their native environments; they never pretend
 * an unavailable environment is compatible (PRD §6.1).
 */
import { join } from 'node:path';
import type { CommandResult, CommandSpec, ParsedArgs } from './cli.js';
import { buildContractArchive } from './contracts/archive.js';
import { checkDeclarationDrift } from './contracts/generate-types.js';
import { formatConformanceReport, runConformance } from './contracts/validate.js';
import { formatVerification, verifyRelease } from './release/verify.js';

function flagString(args: ParsedArgs, name: string, fallback: string): string {
  const value = args.flags.get(name);
  return typeof value === 'string' ? value : fallback;
}

const SUPPORTED_TARGETS = ['win32-x64', 'darwin-arm64'] as const;
type Target = (typeof SUPPORTED_TARGETS)[number];

function isTarget(value: string): value is Target {
  return (SUPPORTED_TARGETS as readonly string[]).includes(value);
}

function targetPlatform(target: Target): NodeJS.Platform {
  return target.split('-')[0] as NodeJS.Platform;
}

function wrongPlatformResult(target: Target): CommandResult {
  return {
    outcome: 'missingPrerequisites',
    message: `--target ${target} requires its native development environment (running on ${process.platform}); run on ${targetPlatform(target)} with the pinned toolchain`,
  };
}

function spikePendingResult(detail: string): CommandResult {
  return {
    outcome: 'missingPrerequisites',
    message: `${detail} The Phase 0 spike (PRD §7.1 P0-B) must pin the exact revision before this command can run; no floating dependency is ever resolved implicitly.`,
  };
}

export const COMMANDS: readonly CommandSpec[] = [
  {
    name: 'contracts:check',
    summary: 'Validate canonical schemas and all valid/invalid fixtures (Node only)',
    handler: async (_args, ctx) => {
      const contractsDir = join(ctx.cwd, 'contracts');
      const report = runConformance(contractsDir);
      const drift = await checkDeclarationDrift(contractsDir);
      const driftLines = drift.map(
        (name) => `FAIL [declaration-drift] contracts/types/${name}.d.ts differs from regeneration`,
      );
      const outcome = report.failures.length === 0 && drift.length === 0 ? 'ok' : 'failed';
      return {
        outcome,
        message: [formatConformanceReport(report), ...driftLines].join('\n'),
        result: { ...report, declarationDrift: drift },
      };
    },
  },
  {
    name: 'contracts:build',
    summary: 'Assemble schema/fixture/type archive and digest into out/',
    handler: async (_args, ctx) => {
      try {
        const archive = await buildContractArchive(ctx.cwd, join(ctx.cwd, 'out'));
        return {
          outcome: 'ok',
          message: [
            `contracts archive ${archive.version}: ${archive.fileCount} files`,
            `dir: ${archive.archiveDir}`,
            `zip: ${archive.zipPath}`,
            `zip sha256: ${archive.zipSha256}`,
            `closure digest: ${archive.digest}`,
          ].join('\n'),
          result: archive,
        };
      } catch (error) {
        return { outcome: 'failed', message: (error as Error).message };
      }
    },
  },
  {
    name: 'backend:prepare',
    summary: 'Verify pins and sync a backend dev environment from its lock',
    handler: async (args) => {
      const target = flagString(args, 'target', 'win32-x64');
      if (!isTarget(target)) {
        return { outcome: 'invalidArgs', message: `unsupported --target ${target}` };
      }
      if (process.platform !== targetPlatform(target)) {
        return wrongPlatformResult(target);
      }
      return spikePendingResult(
        `backend:prepare --target ${target} needs the pinned upstream revision recorded in adapters/${target === 'win32-x64' ? 'windows' : 'macos'}/upstream.lock.`,
      );
    },
  },
  {
    name: 'backend:test',
    summary: 'Run backend unit or --allow-input native tests for a target',
    handler: async (args) => {
      const target = flagString(args, 'target', 'win32-x64');
      if (!isTarget(target)) {
        return { outcome: 'invalidArgs', message: `unsupported --target ${target}` };
      }
      if (process.platform !== targetPlatform(target)) {
        return wrongPlatformResult(target);
      }
      return spikePendingResult(`backend:test --target ${target} requires the prepared environment.`);
    },
  },
  {
    name: 'model:prepare',
    summary: 'Sync model env and fetch the approved model revision to cache',
    handler: async () =>
      spikePendingResult(
        'model:prepare must fetch approved weights explicitly into the configured cache; grounding/models.lock.json is currently unfetched.',
      ),
  },
  {
    name: 'model:export',
    summary: 'Export cached pinned weights to sharded ONNX candidate files',
    handler: async (args) =>
      spikePendingResult(
        `model:export --config ${flagString(args, 'config', '<id>')} requires weights fetched by model:prepare and the pinned export toolchain.`,
      ),
  },
  {
    name: 'model:parity',
    summary: 'Compare reference/export stages with the frozen tolerance profile',
    handler: async (args) =>
      spikePendingResult(
        `model:parity --config ${flagString(args, 'config', '<id>')} requires exported candidate graphs from model:export.`,
      ),
  },
  {
    name: 'package:build',
    summary: 'Assemble already built/verified target artifacts and notices',
    handler: async (args) =>
      spikePendingResult(
        `package:build --target ${flagString(args, 'target', '<target>')} requires a pinned, qualified backend artifact.`,
      ),
  },
  {
    name: 'release:verify',
    summary: 'Validate closure, hashes, compatibility and required evidence',
    handler: async (args, ctx) => {
      const manifest = args.flags.get('manifest');
      if (typeof manifest !== 'string') {
        return { outcome: 'invalidArgs', message: 'release:verify requires --manifest <path>' };
      }
      try {
        const report = await verifyRelease(join(ctx.cwd, manifest));
        return {
          outcome: report.failures.length === 0 ? 'ok' : 'failed',
          message: formatVerification(report),
          result: report,
        };
      } catch (error) {
        return { outcome: 'failed', message: `release:verify failed: ${(error as Error).message}` };
      }
    },
  },
];

export function commandByName(name: string): CommandSpec | undefined {
  return COMMANDS.find((command) => command.name === name);
}

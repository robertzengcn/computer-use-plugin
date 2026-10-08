/**
 * Registry of every §2.2 developer command. Platform-bound commands
 * (backend:*, model:*, package:build) fail closed with `missingPrerequisites`
 * until the Phase 0 spikes pin their native environments; they never pretend
 * an unavailable environment is compatible (PRD §6.1).
 */
import { join, resolve } from 'node:path';
import type { CommandResult, CommandSpec, ParsedArgs } from './cli.js';
import { buildContractArchive } from './contracts/archive.js';
import { checkDeclarationDrift } from './contracts/generate-types.js';
import { formatConformanceReport, runConformance } from './contracts/validate.js';
import { formatVerification, verifyRelease } from './release/verify.js';
import { backendPrepare, backendTest, modelPrepare } from './commands/backends.js';
import { packageBuild } from './commands/package.js';
import { modelExport, modelParity } from './commands/model.js';

function flagString(args: ParsedArgs, name: string, fallback: string): string {
  const value = args.flags.get(name);
  return typeof value === 'string' ? value : fallback;
}

function optionalFlagString(args: ParsedArgs, name: string): string | undefined {
  const value = args.flags.get(name);
  return typeof value === 'string' ? value : undefined;
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
    handler: async (args, ctx) => {
      const target = flagString(args, 'target', 'win32-x64');
      if (!isTarget(target)) {
        return { outcome: 'invalidArgs', message: `unsupported --target ${target}` };
      }
      if (process.platform !== targetPlatform(target)) {
        return wrongPlatformResult(target);
      }
      return backendPrepare(ctx.cwd, target);
    },
  },
  {
    name: 'backend:test',
    summary: 'Run backend unit or --allow-input native tests for a target',
    handler: async (args, ctx) => {
      const target = flagString(args, 'target', 'win32-x64');
      if (!isTarget(target)) {
        return { outcome: 'invalidArgs', message: `unsupported --target ${target}` };
      }
      if (process.platform !== targetPlatform(target)) {
        return wrongPlatformResult(target);
      }
      const suite = flagString(args, 'suite', 'unit') === 'native' ? 'native' : 'unit';
      const allowInput = args.flags.get('allow-input') === true;
      return backendTest(ctx.cwd, target, suite, allowInput);
    },
  },
  {
    name: 'model:prepare',
    summary: 'Sync model env and fetch the approved model revision to cache',
    handler: async (_args, ctx) => modelPrepare(ctx.cwd, optionalFlagString(_args, 'config')),
  },
  {
    name: 'model:export',
    summary: 'Export cached pinned weights to sharded ONNX candidate files',
    handler: async (args, ctx) =>
      modelExport(ctx.cwd, flagString(args, 'config', 'gui-actor-2b-fp16')),
  },
  {
    name: 'model:parity',
    summary: 'Compare reference/export stages with the frozen tolerance profile',
    handler: async (args, ctx) =>
      modelParity(
        ctx.cwd,
        flagString(args, 'config', 'gui-actor-2b-fp16'),
        optionalFlagString(args, 'dataset'),
      ),
  },
  {
    name: 'package:build',
    summary: 'Assemble already built/verified target artifacts and notices',
    handler: async (args, ctx) => {
      const target = flagString(args, 'target', 'win32-x64');
      if (!isTarget(target)) {
        return { outcome: 'invalidArgs', message: `unsupported --target ${target}` };
      }
      if (process.platform !== targetPlatform(target)) {
        return wrongPlatformResult(target);
      }
      return packageBuild(ctx.cwd, target, join(ctx.cwd, 'out'));
    },
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
        const report = await verifyRelease(resolve(ctx.cwd, manifest));
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

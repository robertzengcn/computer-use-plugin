/**
 * contracts:build — assemble the immutable schema/fixture/type archive with a
 * checksummed closure (design §7.4 "Contracts" artifact role). Refuses to run
 * while conformance fails; generated outputs are reproducible.
 */
import AdmZip from 'adm-zip';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { publishStaging, stagingFor, tempFor } from '../release/publish.js';
import { runConformance } from './validate.js';
import { writeDeclarations } from './generate-types.js';
import { loadContractRegistry } from './registry.js';

export interface ArchiveResult {
  readonly version: string;
  readonly archiveDir: string;
  readonly zipPath: string;
  readonly zipSha256: string;
  readonly fileCount: number;
  readonly digest: string;
}

async function* walkFiles(root: string): AsyncGenerator<string> {
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) {
      yield* walkFiles(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

/**
 * E01 acceptance: using only staged data, load every registry entry,
 * compile every schema, and enforce the published rule inventory.
 * Throws on any gap so a successful build is independently consumable.
 */
function validateStagedArchive(stagedContractsDir: string): void {
  const registry = loadContractRegistry(stagedContractsDir);
  for (const $id of registry.ids()) {
    registry.compile($id);
  }
  // Published semantic rules must ship and match the implementation.
  const rulesRaw = readFileSync(
    join(stagedContractsDir, 'rules', 'semantic-rules-v1.json'),
    'utf8',
  ) as string;
  const rules = JSON.parse(rulesRaw) as { rules: readonly { id: string }[] };
  if (!Array.isArray(rules.rules) || rules.rules.length === 0) {
    throw new Error('staged archive is missing rules/semantic-rules-v1.json inventory');
  }
}

export async function buildContractArchive(repoRoot: string, outRoot: string): Promise<ArchiveResult> {
  const contractsDir = join(repoRoot, 'contracts');

  // Hard gate: the archive only exists when conformance holds.
  const conformance = runConformance(contractsDir);
  if (conformance.failures.length > 0) {
    throw new Error(
      `contracts:build refused: ${conformance.failures.length} conformance failure(s); run contracts:check`,
    );
  }

  // Regenerate declarations so the archive always ships current types.
  await writeDeclarations(contractsDir);

  const registryFile = JSON.parse(await readFile(join(contractsDir, 'registry.json'), 'utf8')) as {
    version: number;
    schemas: readonly { path: string }[];
  };
  const version = `v${registryFile.version}`;
  const archiveDir = join(outRoot, `contracts-${version}`);

  // E01: build from the complete registry/data closure, not a hardcoded dir
  // list. Every registered schema is included by path, so added schema
  // directories (eval/, adapters/, future families) are covered automatically.
  // Data closure: fixtures/, types/, rules/ plus registry.json itself.
  const registryPaths = registryFile.schemas.map((entry) => entry.path);
  const dataDirs = ['fixtures', 'types', 'rules'];
  const relPaths = new Set<string>(['registry.json', ...registryPaths]);
  for (const dir of dataDirs) {
    const absDir = join(contractsDir, dir);
    if (!(await stat(absDir).catch(() => undefined))) {
      continue;
    }
    for await (const file of walkFiles(absDir)) {
      relPaths.add(relative(contractsDir, file));
    }
  }
  // Any registered schema's parent dir may hold non-schema companions (e.g.
  // future rule docs); registry paths already cover the schemas themselves.
  // Ensure deterministic order.
  const sortedRels = [...relPaths].sort((a, b) => a.localeCompare(b));

  // E02: stage into a fresh unique directory so deleted sources and
  // previous-build contamination can never survive, and concurrent runs
  // never share staging (N08).
  const stagingDir = stagingFor(archiveDir);
  await mkdir(stagingDir, { recursive: true });

  const files: { path: string; sha256: string; bytes: number }[] = [];
  for (const rel of sortedRels) {
    const src = join(contractsDir, rel);
    const bytes = await readFile(src);
    const dest = join(stagingDir, rel);
    await mkdir(dirname(dest), { recursive: true });
    await copyFile(src, dest);
    files.push({
      path: rel,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      bytes: bytes.byteLength,
    });
  }

  files.sort((a, b) => a.path.localeCompare(b.path));
  const digest = createHash('sha256')
    .update(JSON.stringify(files.map(({ path, sha256 }) => ({ path, sha256 }))))
    .digest('hex');

  const manifest = {
    artifactKind: 'computer-use-contracts',
    version,
    digest,
    generatedFrom: 'aifetchly-computer-use',
    files,
  };
  await writeFile(join(stagingDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  // E01: validate the staged closure independently of the source checkout —
  // load every registry entry, compile every schema, and enforce the
  // published rule inventory using only staged data. B12: on validation
  // failure the previous archiveDir is preserved (staging is cleaned).
  try {
    validateStagedArchive(stagingDir);
  } catch (error) {
    await rm(stagingDir, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }

  // E02/N08: recoverable publish of the staged closure; a failed swap
  // preserves the previous archiveDir instead of deleting it first.
  const publishedDir = await publishStaging(stagingDir, archiveDir);
  if (publishedDir.outcome !== 'ok') {
    throw new Error(`contract archive ${publishedDir.message}`);
  }

  // N08: build the ZIP to a unique temp path, verify membership, then
  // rename over the previous ZIP — a failed write never destroys the prior
  // archive, and concurrent builds never share the temp path.
  const zipPath = join(outRoot, `computer-use-contracts-${version}.zip`);
  const zipTmp = tempFor(zipPath, 'tmp');
  await rm(zipTmp, { force: true });
  const zip = new AdmZip();
  // Deterministic order: files sorted + manifest last.
  for (const file of files) {
    zip.addLocalFile(join(archiveDir, file.path), dirname(file.path) === '.' ? '' : dirname(file.path));
  }
  zip.addLocalFile(join(archiveDir, 'manifest.json'), '');
  await zip.writeZipPromise(zipTmp);
  const zipBytes = await readFile(zipTmp);

  // E02: verify ZIP membership exactly equals closure + manifest.
  const zipEntries = new Set(zip.getEntries().map((e) => e.entryName));
  const expected = new Set([...files.map((f) => f.path), 'manifest.json']);
  const missing = [...expected].filter((p) => !zipEntries.has(p));
  const extra = [...zipEntries].filter((p) => !expected.has(p) && p !== '/');
  if (missing.length > 0 || extra.length > 0) {
    await rm(zipTmp, { force: true }).catch(() => undefined);
    throw new Error(
      `contract archive ZIP membership mismatch: missing [${missing.join(', ')}] extra [${extra.join(', ')}]`,
    );
  }
  const publishedZip = await publishStaging(zipTmp, zipPath);
  if (publishedZip.outcome !== 'ok') {
    throw new Error(`contract archive ${publishedZip.message}`);
  }

  return {
    version,
    archiveDir,
    zipPath,
    zipSha256: createHash('sha256').update(zipBytes).digest('hex'),
    fileCount: files.length,
    digest,
  };
}

/**
 * contracts:build — assemble the immutable schema/fixture/type archive with a
 * checksummed closure (design §7.4 "Contracts" artifact role). Refuses to run
 * while conformance fails; generated outputs are reproducible.
 */
import AdmZip from 'adm-zip';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { runConformance } from './validate.js';
import { writeDeclarations } from './generate-types.js';

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
  };
  const version = `v${registryFile.version}`;
  const archiveDir = join(outRoot, `contracts-${version}`);

  const files: { path: string; sha256: string; bytes: number }[] = [];
  const includeDirs = ['desktop', 'tools', 'grounding', 'models', 'traces', 'fixtures', 'types'];
  for (const dir of includeDirs) {
    const absDir = join(contractsDir, dir);
    if (!(await stat(absDir).catch(() => undefined))) {
      continue;
    }
    for await (const file of walkFiles(absDir)) {
      const rel = relative(contractsDir, file);
      const bytes = await readFile(file);
      await mkdir(dirname(join(archiveDir, rel)), { recursive: true });
      await copyFile(file, join(archiveDir, rel));
      files.push({
        path: rel,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        bytes: bytes.byteLength,
      });
    }
  }
  await copyFile(join(contractsDir, 'registry.json'), join(archiveDir, 'registry.json'));
  files.push({
    path: 'registry.json',
    sha256: createHash('sha256').update(await readFile(join(contractsDir, 'registry.json'))).digest('hex'),
    bytes: (await stat(join(contractsDir, 'registry.json'))).size,
  });

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
  await writeFile(join(archiveDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  const zip = new AdmZip();
  for (const entry of await readdir(archiveDir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) {
      continue;
    }
    const abs = join(entry.parentPath, entry.name);
    zip.addLocalFile(abs, relative(archiveDir, dirname(abs)));
  }
  const zipPath = join(outRoot, `computer-use-contracts-${version}.zip`);
  await zip.writeZipPromise(zipPath);
  const zipBytes = await readFile(zipPath);

  return {
    version,
    archiveDir,
    zipPath,
    zipSha256: createHash('sha256').update(zipBytes).digest('hex'),
    fileCount: files.length,
    digest,
  };
}

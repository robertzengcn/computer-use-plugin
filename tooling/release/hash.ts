/** Deterministic SHA-256 helpers for artifact closure verification (§7.4). */
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

export async function sha256File(path: string): Promise<string> {
  const bytes = await readFile(path);
  return createHash('sha256').update(bytes).digest('hex');
}

/** Deterministic directory digest: files sorted by path, hashed as path:sha pairs. */
export async function sha256Directory(dir: string): Promise<string> {
  const files = await listFilesSorted(dir);
  const pairs: string[] = [];
  for (const file of files) {
    pairs.push(`${file}:${await sha256File(join(dir, file))}`);
  }
  return createHash('sha256').update(pairs.join('\n')).digest('hex');
}

async function listFilesSorted(root: string, prefix = ''): Promise<string[]> {
  const entries = await readdir(join(root, prefix), { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const rel = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...(await listFilesSorted(root, rel)));
    } else if (entry.isFile()) {
      files.push(rel);
    }
  }
  return files.sort((a, b) => a.localeCompare(b));
}

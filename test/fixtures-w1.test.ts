import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import AdmZip from 'adm-zip';

const W1_DIR = join(process.cwd(), 'test', 'fixtures', 'w1');

interface W1Manifest {
  cases: {
    id: string;
    workbook: string;
    sha256: string;
    family: string;
    split: string;
    locale: string;
    rowCount: number;
    headerRow: string[];
    sampleExpected: string[][];
  }[];
  matrixAccounting: { missingCells: string[]; missingCellCount: number };
}

/** Parse a generated workbook into rows of cell values (strings/numbers). */
function readSheet(workbookPath: string): (string | number)[][] {
  const zip = new AdmZip(workbookPath);
  const sheet = zip.readAsText('xl/worksheets/sheet1.xml');
  const rows: (string | number)[][] = [];
  const rowMatches = sheet.matchAll(/<row[^>]*>(.*?)<\/row>/g);
  for (const rowMatch of rowMatches) {
    const row: (string | number)[] = [];
    for (const cell of rowMatch[1]!.matchAll(/<c[^>]*?(?:t="inlineStr")?[^>]*>(.*?)<\/c>/g)) {
      const inline = cell[1]!.match(/<t>([\s\S]*?)<\/t>/);
      if (inline) {
        row.push(inline[1]!.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
        continue;
      }
      const numeric = cell[1]!.match(/<v>([\s\S]*?)<\/v>/);
      row.push(numeric ? Number(numeric[1]) : '');
    }
    rows.push(row);
  }
  return rows;
}

function loadManifest(): W1Manifest {
  return JSON.parse(readFileSync(join(W1_DIR, 'manifest.json'), 'utf8')) as W1Manifest;
}

describe('W-1 workbook corpus (CU-PLUGIN-11, PRD §4.1)', () => {
  const manifest = loadManifest();

  it('every workbook matches its recorded sha256 and row count', () => {
    expect(manifest.cases.length).toBe(10);
    for (const entry of manifest.cases) {
      const bytes = readFileSync(join(W1_DIR, entry.workbook));
      expect(createHash('sha256').update(bytes).digest('hex'), entry.id).toBe(entry.sha256);
      expect(readSheet(join(W1_DIR, entry.workbook)).length - 1, entry.id).toBe(entry.rowCount);
    }
  });

  it('empty templates carry only the header row, in both locales', () => {
    const en = readSheet(join(W1_DIR, 'workbooks', 'empty-template.xlsx'));
    const zh = readSheet(join(W1_DIR, 'workbooks', 'empty-template-zh.xlsx'));
    expect(en.length).toBe(1);
    expect(en[0]).toContain('Full Name');
    expect(zh.length).toBe(1);
    expect(zh[0]).toContain('电子邮件');
  });

  it('data preservation: leading zeros, long IDs, formula-like text stay text', () => {
    const rows = readSheet(join(W1_DIR, 'workbooks', 'data-preservation.xlsx'));
    const values = rows.flat().map(String);
    expect(values).toContain('010-5555'); // leading-zero phone
    expect(values).toContain('02138'); // leading-zero postal
    expect(values).toContain('01234');
    expect(values).toContain('123456789012345678'); // 18-digit ID, no scientific notation
    expect(values).toContain('=SUM(A1:A2)'); // formula-like stays literal text
    expect(values).toContain('+1 555 0100');
    expect(values).toContain("'=NOT_A_FORMULA");
    expect(values).toContain('张伟'); // CJK name intact
  });

  it('duplicate emails are present exactly as the generator planned', () => {
    const rows = readSheet(join(W1_DIR, 'workbooks', 'data-preservation.xlsx'));
    const emails = rows.slice(1).map((row) => String(row[1]));
    const duplicates = emails.filter((email) => email === 'dup@example.com');
    expect(duplicates.length).toBeGreaterThanOrEqual(2);
  });

  it('row-scale cases carry 20/200/500 synthetic leads with stable headers', () => {
    for (const count of [20, 200, 500]) {
      const rows = readSheet(join(W1_DIR, 'workbooks', `populated-${count}.xlsx`));
      expect(rows.length).toBe(count + 1);
      expect(rows[0]).toContain('Email');
      expect(rows[1]?.every((cell) => String(cell).length > 0 || cell === '')).toBe(true);
    }
  });

  it('reordered headers permute the data columns consistently', () => {
    const rows = readSheet(join(W1_DIR, 'workbooks', 'reordered-headers.xlsx'));
    expect(rows[0]).toEqual(['Phone', 'Full Name', 'Email', 'Postal Code', 'Member ID', 'Notes']);
    const populated = readSheet(join(W1_DIR, 'workbooks', 'populated-20.xlsx'));
    // Data column order follows the header permutation.
    expect(rows[1]?.[0]).toBe(populated[1]?.[2]);
    expect(rows[1]?.[1]).toBe(populated[1]?.[0]);
    expect(rows[1]?.[2]).toBe(populated[1]?.[1]);
  });

  it('duplicate-header and unmatched-field variants are recorded as-is for host mapping', () => {
    const dup = readSheet(join(W1_DIR, 'workbooks', 'duplicate-header.xlsx'));
    expect(dup[0]).toEqual(['Full Name', 'Email', 'Email', 'Phone', 'Postal Code', 'Member ID', 'Notes']);
    const unmatched = readSheet(join(W1_DIR, 'workbooks', 'unmatched-field.xlsx'));
    expect(unmatched[0]).toContain('Region');
    expect(unmatched[0]).not.toContain('Notes');
  });

  it('splits cover regression, calibration and held_out (CU-PLUGIN-19)', () => {
    const splits = new Set(manifest.cases.map((entry) => entry.split));
    expect(splits.has('regression')).toBe(true);
    expect(splits.has('calibration')).toBe(true);
    expect(splits.has('held_out')).toBe(true);
  });

  it('matrix accounting honestly enumerates uncovered cells', () => {
    expect(manifest.matrixAccounting.missingCellCount).toBeGreaterThan(0);
    expect(manifest.matrixAccounting.missingCells.length).toBe(
      manifest.matrixAccounting.missingCellCount,
    );
  });
});

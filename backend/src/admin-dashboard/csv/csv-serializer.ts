/**
 * Dependency-free RFC-4180 CSV writer (research D5). UTF-8 BOM so Excel reads zh-TW correctly,
 * CRLF line endings, and CSV-injection neutralization: any cell beginning with = + - @ TAB or CR is
 * prefixed with a single quote so spreadsheet apps treat it as text, not a formula (FR-020).
 */
const BOM = String.fromCharCode(0xfeff); // UTF-8 BOM (no irregular-whitespace literal in source)
const FORMULA_LEAD = /^[=+\-@\t\r]/;

const neutralize = (cell: string): string => (FORMULA_LEAD.test(cell) ? `'${cell}` : cell);

const quote = (cell: string): string => {
  const escaped = cell.replace(/"/g, '""');
  return /[",\r\n]/.test(cell) ? `"${escaped}"` : escaped;
};

/** Neutralize formula injection, then RFC-4180 quote/escape. */
export const csvCell = (raw: string): string => quote(neutralize(raw));

export const serializeCsv = (header: readonly string[], rows: readonly string[][]): string => {
  const lines = [header, ...rows].map((cols) => cols.map(csvCell).join(','));
  return BOM + lines.join('\r\n') + '\r\n';
};

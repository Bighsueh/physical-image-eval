import { BLUEPRINT_ID_REGEX } from '../../catalog/constants/catalog-constants';
import { ParsedDiagnosisSchema, type ParsedDiagnosis } from './types';

/**
 * Parse the diagnosis matrix from `00_藍圖總索引與設計規範.md` (D2 — authoritative source).
 * Region tables yield MAPPED (non-Y blueprint) / TEMPLATE (Y-series blueprint) diagnoses and
 * declare the expected blueprint set (FR-002); the 轉介類 table yields the REFERRAL rows. Table rows are parsed line-by-line (the source uses GFM
 * pipe tables; remark-parse alone does not emit table nodes, and a line parse is robust here).
 */

/** Split a markdown table row `| a | b | c |` into trimmed cell values. */
const rowCells = (line: string): string[] =>
  line
    .trim()
    .split('|')
    .slice(1, -1)
    .map((c) => c.trim());

/** Parse `名稱(矩陣號…)、…` (annotations after the number, e.g. `(117，頸段)`, are ignored). */
const parseCovered = (covered: string): Array<{ matrixNo: number; nameZh: string }> => {
  const out: Array<{ matrixNo: number; nameZh: string }> = [];
  for (const entry of covered.split('、')) {
    const m = /^(.+?)\s*[（(](\d+)/.exec(entry.trim());
    if (m) out.push({ nameZh: m[1].trim(), matrixNo: Number(m[2]) });
  }
  return out;
};

interface IndexRow {
  cols: string[];
  inReferral: boolean;
}

/** Walk the index's pipe-table rows, tagging each with whether it sits in the 轉介類 section. */
const indexRows = (content: string): IndexRow[] => {
  const rows: IndexRow[] = [];
  let inReferral = false;
  for (const line of content.split('\n')) {
    // Section tracking: the 轉介類 subsection is the only REFERRAL table.
    if (/^#{2,3}\s/.test(line)) {
      inReferral = /轉介/.test(line);
      continue;
    }
    if (!line.trim().startsWith('|')) continue;
    const cols = rowCells(line);
    if (cols.length >= 2) rows.push({ cols, inReferral });
  }
  return rows;
};

/** Blueprint IDs declared by the region tables, in index order (FR-002 expected set). */
export const parseIndexBlueprintIds = (content: string): string[] =>
  indexRows(content)
    .filter((r) => !r.inReferral && BLUEPRINT_ID_REGEX.test(r.cols[0]))
    .map((r) => r.cols[0]);

export const parseIndex = (content: string): ParsedDiagnosis[] => {
  const diagnoses: ParsedDiagnosis[] = [];

  for (const { cols, inReferral } of indexRows(content)) {
    if (!inReferral) {
      const blueprintId = cols[0];
      if (!BLUEPRINT_ID_REGEX.test(blueprintId)) continue; // skip header/separator rows
      const mappingKind = blueprintId.startsWith('Y') ? 'TEMPLATE' : 'MAPPED';
      for (const { matrixNo, nameZh } of parseCovered(cols[2] ?? '')) {
        // safeParse — a malformed row is SKIPPED (then caught by FR-008 reconciliation), never
        // thrown (which would misclassify a bad source as exit 3 instead of 1).
        const r = ParsedDiagnosisSchema.safeParse({ matrixNo, nameZh, mappingKind, mappedBlueprintId: blueprintId });
        if (r.success) diagnoses.push(r.data);
      }
    } else {
      const matrixNo = cols[0];
      if (!/^[1-9]\d*$/.test(matrixNo)) continue; // skip header/separator/zero rows
      const r = ParsedDiagnosisSchema.safeParse({
        matrixNo: Number(matrixNo),
        nameZh: (cols[1] ?? '').trim(),
        mappingKind: 'REFERRAL',
        mappedBlueprintId: null,
      });
      if (r.success) diagnoses.push(r.data);
    }
  }

  return diagnoses;
};

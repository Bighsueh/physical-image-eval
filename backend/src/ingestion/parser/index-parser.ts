import { BLUEPRINT_ID_REGEX } from '../../catalog/constants/catalog-constants';
import { ParsedDiagnosisSchema, type ParsedDiagnosis } from './types';

/**
 * Parse the 134-diagnosis matrix from `00_藍圖總索引與設計規範.md` (D2 — authoritative source).
 * Region tables yield MAPPED (non-Y blueprint) / TEMPLATE (Y-series blueprint) diagnoses; the
 * 轉介類 table yields the 6 REFERRAL rows. Table rows are parsed line-by-line (the source uses GFM
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

export const parseIndex = (content: string): ParsedDiagnosis[] => {
  const diagnoses: ParsedDiagnosis[] = [];
  let inReferral = false;

  for (const line of content.split('\n')) {
    // Section tracking: the 轉介類 subsection is the only REFERRAL table.
    if (/^#{2,3}\s/.test(line)) {
      inReferral = /轉介/.test(line);
      continue;
    }
    if (!line.trim().startsWith('|')) continue;

    const cols = rowCells(line);
    if (cols.length < 2) continue;

    if (!inReferral) {
      const blueprintId = cols[0];
      if (!BLUEPRINT_ID_REGEX.test(blueprintId)) continue; // skip header/separator rows
      const mappingKind = blueprintId.startsWith('Y') ? 'TEMPLATE' : 'MAPPED';
      for (const { matrixNo, nameZh } of parseCovered(cols[2] ?? '')) {
        diagnoses.push(
          ParsedDiagnosisSchema.parse({ matrixNo, nameZh, mappingKind, mappedBlueprintId: blueprintId }),
        );
      }
    } else {
      const matrixNo = cols[0];
      if (!/^\d+$/.test(matrixNo)) continue; // skip header/separator rows
      diagnoses.push(
        ParsedDiagnosisSchema.parse({
          matrixNo: Number(matrixNo),
          nameZh: (cols[1] ?? '').trim(),
          mappingKind: 'REFERRAL',
          mappedBlueprintId: null,
        }),
      );
    }
  }

  return diagnoses;
};

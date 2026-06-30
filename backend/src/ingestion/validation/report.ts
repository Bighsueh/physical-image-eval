import { ALL_REGION_CODES } from '../../catalog/constants/catalog-constants';
import { countPerRegion, computeHighRisk } from './invariants';
import type { ParsedCatalog } from '../parser/types';
import type { IngestReport, ReportDiff, ReportError, ReportWarning } from './report-types';

/**
 * Build the structured IngestReport from a parsed catalog + collected errors (+ optional diff), then
 * render a zh-TW human-readable summary. Warnings (FR-021) are computed here and kept DISTINCT from
 * fatal errors: empty timingHint/visualDescription, 0 covered diagnoses, per-blueprint cross-check.
 */
export const computeWarnings = (catalog: ParsedCatalog): ReportWarning[] => {
  const warnings: ReportWarning[] = [];

  // Diagnoses mapped to each blueprint (for the 0-covered warning + cross-check).
  const namesByBlueprint = new Map<string, Set<string>>();
  const countByBlueprint = new Map<string, number>();
  for (const d of catalog.diagnoses) {
    if (!d.mappedBlueprintId) continue;
    countByBlueprint.set(d.mappedBlueprintId, (countByBlueprint.get(d.mappedBlueprintId) ?? 0) + 1);
    const set = namesByBlueprint.get(d.mappedBlueprintId) ?? new Set<string>();
    set.add(d.nameZh);
    namesByBlueprint.set(d.mappedBlueprintId, set);
  }

  for (const b of catalog.blueprints) {
    for (const p of b.panels) {
      if (p.timingHint === null) warnings.push({ blueprintId: b.blueprintId, panelIndex: p.panelIndex, message: '時間提示為空' });
      if (p.visualDescription === null) warnings.push({ blueprintId: b.blueprintId, panelIndex: p.panelIndex, message: '畫面視覺描述為空' });
    }
    if ((countByBlueprint.get(b.blueprintId) ?? 0) === 0) {
      warnings.push({ blueprintId: b.blueprintId, message: '此藍圖涵蓋診斷為 0 筆' });
    }
    // Cross-check (D2): the per-blueprint 涵蓋診斷 names should be a subset of the index mapping.
    const indexNames = namesByBlueprint.get(b.blueprintId) ?? new Set<string>();
    for (const name of b.coveredDiagnosisNames) {
      if (!indexNames.has(name)) {
        warnings.push({ blueprintId: b.blueprintId, message: `企劃涵蓋診斷「${name}」未見於總索引對照` });
      }
    }
  }

  return warnings;
};

export const buildReport = (
  catalog: ParsedCatalog,
  errors: ReportError[],
  diff?: ReportDiff,
): IngestReport => {
  const reconciliation = {
    total: catalog.diagnoses.length,
    mapped: catalog.diagnoses.filter((d) => d.mappingKind === 'MAPPED').length,
    template: catalog.diagnoses.filter((d) => d.mappingKind === 'TEMPLATE').length,
    referral: catalog.diagnoses.filter((d) => d.mappingKind === 'REFERRAL').length,
  };
  return {
    ok: errors.length === 0,
    counts: { blueprints: catalog.blueprints.length, perRegion: countPerRegion(catalog) },
    reconciliation,
    highRisk: computeHighRisk(catalog),
    warnings: computeWarnings(catalog),
    errors,
    ...(diff ? { diff } : {}),
  };
};

/** Render the structured report as a zh-TW human-readable summary (FR-012/FR-021/SC-004). */
export const renderReport = (report: IngestReport): string => {
  const lines: string[] = [];
  lines.push(report.ok ? '✅ 匯入驗證通過' : '❌ 匯入失敗（fail-fast，未寫入任何資料）');
  lines.push('');
  lines.push(`藍圖總數：${report.counts.blueprints}`);
  lines.push(
    '各區域數量：' +
      ALL_REGION_CODES.map((c) => `${c}=${report.counts.perRegion[c]}`).join(' '),
  );
  const r = report.reconciliation;
  lines.push(
    `診斷對帳：總 ${r.total}（已對應 ${r.mapped} + 通用處方模板 ${r.template} = ${r.mapped + r.template}；轉介 ${r.referral}）`,
  );
  lines.push(`高風險藍圖（${report.highRisk.length}）：${report.highRisk.join('、')}`);

  if (report.diff) {
    lines.push('');
    lines.push('本次相對上次的變更：');
    lines.push(`  新增：${report.diff.added.join('、') || '（無）'}`);
    lines.push(`  修改：${report.diff.modified.join('、') || '（無）'}`);
    lines.push(`  移除：${report.diff.removed.join('、') || '（無）'}`);
  }

  if (report.warnings.length > 0) {
    lines.push('');
    lines.push(`⚠️ 警示（${report.warnings.length}，非硬錯）：`);
    for (const w of report.warnings) {
      const loc = [w.blueprintId, w.panelIndex ? `圖${w.panelIndex}` : null].filter(Boolean).join(' ');
      lines.push(`  - ${loc ? `[${loc}] ` : ''}${w.message}`);
    }
  }

  if (report.errors.length > 0) {
    lines.push('');
    lines.push(`🛑 錯誤（${report.errors.length}）：`);
    for (const e of report.errors) {
      const loc = [
        e.blueprintId,
        e.panelIndex ? `圖${e.panelIndex}` : null,
        e.diagnosisNo ? `診斷#${e.diagnosisNo}` : null,
      ]
        .filter(Boolean)
        .join(' ');
      lines.push(`  - [${e.invariant}]${loc ? ` ${loc}` : ''}：${e.message}`);
    }
  }

  return lines.join('\n');
};

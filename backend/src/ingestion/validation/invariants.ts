import type { RegionCode } from '@prisma/client';
import { ALL_REGION_CODES, HIGH_RISK_BLUEPRINT_IDS } from '../../catalog/constants/catalog-constants';
import { isLegalBlueprintId, parseBlueprintId } from '../parser/id-region';
import type { ParsedCatalog } from '../parser/types';
import type { ReportError } from './report-types';

/**
 * All fail-fast invariants over a ParsedCatalog (FR-002..FR-010, FR-022). Cardinalities are never
 * hard-coded: the source index declares the expected blueprint set and diagnosis numbering.
 * Collects a LOCATED ReportError per violation (no throwing) so the report can point at the
 * blueprintId / panelIndex / diagnosisNo (SC-004). An empty array means the catalog is clean and may be persisted.
 */
const isBlank = (s: string | null | undefined): boolean => (s ?? '').trim().length === 0;

export const collectErrors = (catalog: ParsedCatalog): ReportError[] => {
  const errors: ReportError[] = [];
  const { blueprints, diagnoses, imageInventory } = catalog;
  const blueprintIds = new Set(blueprints.map((b) => b.blueprintId));

  // FR-022: legal + unique IDs.
  const seen = new Set<string>();
  for (const b of blueprints) {
    if (!isLegalBlueprintId(b.blueprintId)) {
      errors.push({ invariant: 'FR-022:legal-id', blueprintId: b.blueprintId, message: `非法藍圖 ID：${b.blueprintId}` });
    }
    if (seen.has(b.blueprintId)) {
      errors.push({ invariant: 'FR-022:unique-id', blueprintId: b.blueprintId, message: `重複藍圖 ID：${b.blueprintId}` });
    }
    seen.add(b.blueprintId);
    // D6 cross-check: the id's region letter must match its containing folder's region.
    const parsed = parseBlueprintId(b.blueprintId);
    if (parsed && parsed.regionCode !== b.regionCode) {
      errors.push({
        invariant: 'D6:id-folder',
        blueprintId: b.blueprintId,
        message: `藍圖 ${b.blueprintId} 的區域字母與所屬資料夾區域 ${b.regionCode} 不符`,
      });
    }
  }

  // FR-002: the source blueprint set equals the set the index declares (no hard-coded count).
  const indexIds = new Set(catalog.indexBlueprintIds);
  for (const id of indexIds) {
    if (!blueprintIds.has(id)) {
      errors.push({ invariant: 'FR-002:missing-blueprint', blueprintId: id, message: `總索引列出藍圖 ${id}，但來源缺少其企劃檔` });
    }
  }
  for (const id of blueprintIds) {
    if (!indexIds.has(id)) {
      errors.push({ invariant: 'FR-002:unlisted-blueprint', blueprintId: id, message: `來源藍圖 ${id} 未列於總索引` });
    }
  }

  // FR-003: every region holds at least one blueprint.
  const perRegion = countPerRegion(catalog);
  for (const code of ALL_REGION_CODES) {
    if (perRegion[code] === 0) {
      errors.push({ invariant: 'FR-003:empty-region', message: `區域 ${code} 沒有任何藍圖` });
    }
  }

  // Per-blueprint structural + content checks.
  for (const b of blueprints) {
    // FR-004: exactly panels {1,2,3,4}.
    const indices = b.panels.map((p) => p.panelIndex).sort((a, c) => a - c);
    if (indices.length !== 4 || indices.join(',') !== '1,2,3,4') {
      errors.push({ invariant: 'FR-004:panels', blueprintId: b.blueprintId, message: `分格應恰為 4 格（圖1..圖4），實際為 ${b.panels.length} 格` });
    }
    // FR-006: non-empty overall metadata.
    if (isBlank(b.indications)) errors.push({ invariant: 'FR-006:indications', blueprintId: b.blueprintId, message: '適應症為空' });
    if (isBlank(b.frequency)) errors.push({ invariant: 'FR-006:frequency', blueprintId: b.blueprintId, message: '練習次數為空' });
    if (isBlank(b.gentleReminder)) errors.push({ invariant: 'FR-006:gentleReminder', blueprintId: b.blueprintId, message: '溫馨小叮嚀為空' });
    // FR-007: every panel actionDescription non-empty.
    for (const p of b.panels) {
      if (isBlank(p.actionDescription)) {
        errors.push({ invariant: 'FR-007:action', blueprintId: b.blueprintId, panelIndex: p.panelIndex, message: `第 ${p.panelIndex} 格動作說明為空` });
      }
    }
    // FR-005: exactly one image, no missing/multi.
    const matchCount = imageInventory.filter((id) => id === b.blueprintId).length;
    if (matchCount === 0) errors.push({ invariant: 'FR-005:orphan-blueprint', blueprintId: b.blueprintId, message: `藍圖 ${b.blueprintId} 找不到對應圖檔` });
    else if (matchCount > 1) errors.push({ invariant: 'FR-005:multi-image', blueprintId: b.blueprintId, message: `藍圖 ${b.blueprintId} 對應到多於一個圖檔` });
  }

  // FR-005: no orphan image (image with no blueprint).
  for (const imgId of new Set(imageInventory)) {
    if (!blueprintIds.has(imgId)) {
      errors.push({ invariant: 'FR-005:orphan-image', blueprintId: imgId, message: `圖檔 ${imgId} 找不到對應藍圖` });
    }
  }

  // FR-010: high-risk set equals the named constant exactly.
  const marked = new Set(blueprints.filter((b) => HIGH_RISK_BLUEPRINT_IDS.has(b.blueprintId)).map((b) => b.blueprintId));
  for (const id of HIGH_RISK_BLUEPRINT_IDS) {
    if (!marked.has(id) && blueprintIds.has(id) === false) {
      errors.push({ invariant: 'FR-010:highrisk-missing', blueprintId: id, message: `高風險藍圖 ${id} 不存在於目錄` });
    }
  }
  // (Derivation is from the constant, so marked ⊆ constant by construction; the only failure mode
  //  is a high-risk id missing from the catalog, handled above.)

  // FR-008: matrix numbers are unique and contiguous 1..N (N = diagnoses listed in the index).
  const byNo = new Set<number>();
  for (const d of diagnoses) {
    if (byNo.has(d.matrixNo)) errors.push({ invariant: 'FR-008:dup-matrixNo', diagnosisNo: d.matrixNo, message: `重複矩陣編號：${d.matrixNo}` });
    byNo.add(d.matrixNo);
  }
  if (diagnoses.length === 0) errors.push({ invariant: 'FR-008:empty', message: '總索引未列出任何診斷' });
  const maxNo = Math.max(0, ...byNo);
  for (let no = 1; no <= maxNo; no += 1) {
    if (!byNo.has(no)) errors.push({ invariant: 'FR-008:gap', diagnosisNo: no, message: `診斷矩陣編號缺號：${no}` });
  }

  // FR-009: every non-referral diagnosis resolves to an existing blueprint; REFERRAL ⇔ null.
  for (const d of diagnoses) {
    if (d.mappingKind === 'REFERRAL') {
      if (d.mappedBlueprintId !== null) errors.push({ invariant: 'FR-009:referral-points', diagnosisNo: d.matrixNo, message: `轉介診斷 ${d.matrixNo} 不應指向藍圖` });
    } else if (d.mappedBlueprintId === null || !blueprintIds.has(d.mappedBlueprintId)) {
      errors.push({ invariant: 'FR-009:dangling', diagnosisNo: d.matrixNo, message: `診斷 ${d.matrixNo} 指向不存在的藍圖 ${d.mappedBlueprintId ?? '(無)'}` });
    }
  }

  return errors;
};

export const countPerRegion = (catalog: ParsedCatalog): Record<RegionCode, number> => {
  const counts: Record<RegionCode, number> = { S: 0, H: 0, E: 0, T: 0, P: 0, K: 0, L: 0, Y: 0 };
  for (const b of catalog.blueprints) counts[b.regionCode] += 1;
  return counts;
};

export const computeHighRisk = (catalog: ParsedCatalog): string[] =>
  catalog.blueprints
    .filter((b) => HIGH_RISK_BLUEPRINT_IDS.has(b.blueprintId))
    .map((b) => b.blueprintId)
    .sort();

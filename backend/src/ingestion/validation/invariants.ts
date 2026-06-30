import type { RegionCode } from '@prisma/client';
import {
  DIAGNOSIS_MAPPED_TEMPLATE,
  DIAGNOSIS_REFERRAL,
  DIAGNOSIS_TOTAL,
  HIGH_RISK_BLUEPRINT_IDS,
  REGION_COUNTS,
  TOTAL_BLUEPRINTS,
} from '../../catalog/constants/catalog-constants';
import { isLegalBlueprintId } from '../parser/id-region';
import type { ParsedCatalog } from '../parser/types';
import type { ReportError } from './report-types';

/**
 * All fail-fast invariants over a ParsedCatalog (FR-002..FR-010, FR-022). Collects a LOCATED
 * ReportError per violation (no throwing) so the report can point at the blueprintId / panelIndex /
 * diagnosisNo (SC-004). An empty array means the catalog is clean and may be persisted.
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
  }

  // FR-002: exactly 51 blueprints.
  if (blueprints.length !== TOTAL_BLUEPRINTS) {
    errors.push({ invariant: 'FR-002:count', message: `藍圖數量應為 ${TOTAL_BLUEPRINTS}，實際為 ${blueprints.length}` });
  }

  // FR-003: per-region counts.
  const perRegion = countPerRegion(catalog);
  for (const code of Object.keys(REGION_COUNTS) as RegionCode[]) {
    if (perRegion[code] !== REGION_COUNTS[code]) {
      errors.push({ invariant: 'FR-003:region-count', message: `區域 ${code} 藍圖數應為 ${REGION_COUNTS[code]}，實際為 ${perRegion[code]}` });
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

  // FR-008: reconciliation + unique matrixNo.
  const byNo = new Set<number>();
  for (const d of diagnoses) {
    if (byNo.has(d.matrixNo)) errors.push({ invariant: 'FR-008:dup-matrixNo', diagnosisNo: d.matrixNo, message: `重複矩陣編號：${d.matrixNo}` });
    byNo.add(d.matrixNo);
  }
  const mapped = diagnoses.filter((d) => d.mappingKind === 'MAPPED').length;
  const template = diagnoses.filter((d) => d.mappingKind === 'TEMPLATE').length;
  const referral = diagnoses.filter((d) => d.mappingKind === 'REFERRAL').length;
  if (diagnoses.length !== DIAGNOSIS_TOTAL) errors.push({ invariant: 'FR-008:total', message: `診斷總數應為 ${DIAGNOSIS_TOTAL}，實際為 ${diagnoses.length}` });
  if (mapped + template !== DIAGNOSIS_MAPPED_TEMPLATE) errors.push({ invariant: 'FR-008:mapped-template', message: `對應到藍圖診斷應為 ${DIAGNOSIS_MAPPED_TEMPLATE}，實際為 ${mapped + template}` });
  if (referral !== DIAGNOSIS_REFERRAL) errors.push({ invariant: 'FR-008:referral', message: `轉介診斷應為 ${DIAGNOSIS_REFERRAL}，實際為 ${referral}` });

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

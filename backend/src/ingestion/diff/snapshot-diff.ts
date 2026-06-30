import { prisma } from '../../lib/prisma';
import type { ParsedCatalog } from '../parser/types';
import type { ReportDiff } from '../validation/report-types';

/**
 * Re-run diff (D4): read the existing catalog snapshot and compute added/modified/removed vs the
 * newly parsed set — blueprints keyed by blueprintId + contentHash, diagnoses by matrixNo + mapping.
 * Reported only; it never changes the snapshot-replace behavior.
 */
export interface CatalogSnapshot {
  blueprintHash: Map<string, string>; // blueprintId → contentHash
  diagnosisKey: Map<number, string>; // matrixNo → `${kind}|${mappedBlueprintId ?? ''}`
}

export const readSnapshot = async (): Promise<CatalogSnapshot> => {
  const blueprints = await prisma.blueprint.findMany({ select: { blueprintId: true, contentHash: true } });
  const diagnoses = await prisma.diagnosis.findMany({
    select: { matrixNo: true, mappingKind: true, mappedBlueprint: { select: { blueprintId: true } } },
  });
  return {
    blueprintHash: new Map(blueprints.map((b) => [b.blueprintId, b.contentHash])),
    diagnosisKey: new Map(
      diagnoses.map((d) => [d.matrixNo, `${d.mappingKind}|${d.mappedBlueprint?.blueprintId ?? ''}`]),
    ),
  };
};

const diagnosisKeyOf = (kind: string, mappedBlueprintId: string | null): string =>
  `${kind}|${mappedBlueprintId ?? ''}`;

export const computeDiff = (prev: CatalogSnapshot, next: ParsedCatalog): ReportDiff => {
  const added: string[] = [];
  const modified: string[] = [];
  const removed: string[] = [];

  const nextHash = new Map(next.blueprints.map((b) => [b.blueprintId, b.contentHash]));
  for (const [id, hash] of nextHash) {
    if (!prev.blueprintHash.has(id)) added.push(id);
    else if (prev.blueprintHash.get(id) !== hash) modified.push(id);
  }
  for (const id of prev.blueprintHash.keys()) {
    if (!nextHash.has(id)) removed.push(id);
  }

  // Diagnosis remaps surface as 診斷#<no> entries in modified (T045).
  const nextDiag = new Map(next.diagnoses.map((d) => [d.matrixNo, diagnosisKeyOf(d.mappingKind, d.mappedBlueprintId)]));
  for (const [no, key] of nextDiag) {
    const before = prev.diagnosisKey.get(no);
    if (before === undefined) added.push(`診斷#${no}`);
    else if (before !== key) modified.push(`診斷#${no}`);
  }
  for (const no of prev.diagnosisKey.keys()) {
    if (!nextDiag.has(no)) removed.push(`診斷#${no}`);
  }

  return {
    added: added.sort(),
    modified: modified.sort(),
    removed: removed.sort(),
  };
};

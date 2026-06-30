import type { MappingKind, RegionCode } from '@prisma/client';

/**
 * Public projections (allow-list) — `aiPrompt`, `contentHash`, `sourceMarkdownRef` are NEVER
 * included (FR-019/FR-020, D7). Each projection lists fields explicitly so a future schema column
 * cannot leak by accident. `imageUrl` is the blueprint-keyed read-only image route (D5).
 */
export const imageUrlFor = (blueprintId: string): string => `/api/blueprints/${blueprintId}/image`;

export interface RegionDto {
  regionCode: RegionCode;
  nameZh: string;
  nameEn: string;
  displayOrder: number;
  blueprintCount: number;
}

export const toRegionDto = (r: {
  regionCode: RegionCode;
  nameZh: string;
  nameEn: string;
  displayOrder: number;
  _count: { blueprints: number };
}): RegionDto => ({
  regionCode: r.regionCode,
  nameZh: r.nameZh,
  nameEn: r.nameEn,
  displayOrder: r.displayOrder,
  blueprintCount: r._count.blueprints,
});

export interface BlueprintSummaryDto {
  blueprintId: string;
  regionCode: RegionCode;
  exerciseName: string;
  isHighRisk: boolean;
  imageUrl: string;
  diagnosisCount: number;
}

export const toBlueprintSummaryDto = (b: {
  blueprintId: string;
  exerciseName: string;
  isHighRisk: boolean;
  region: { regionCode: RegionCode };
  _count: { diagnoses: number };
}): BlueprintSummaryDto => ({
  blueprintId: b.blueprintId,
  regionCode: b.region.regionCode,
  exerciseName: b.exerciseName,
  isHighRisk: b.isHighRisk,
  imageUrl: imageUrlFor(b.blueprintId),
  diagnosisCount: b._count.diagnoses,
});

export interface PanelDto {
  panelIndex: number;
  stepName: string;
  actionDescription: string;
  timingHint: string | null;
  visualDescription: string | null;
}

export interface DiagnosisDto {
  matrixNo: number;
  nameZh: string;
  mappingKind: MappingKind;
  mappedBlueprintId: string | null;
}

export interface BlueprintDetailDto {
  blueprintId: string;
  regionCode: RegionCode;
  regionNameZh: string;
  exerciseName: string;
  indications: string;
  frequency: string;
  gentleReminder: string;
  version: string;
  isHighRisk: boolean;
  imageUrl: string;
  panels: PanelDto[];
  diagnoses: Array<Pick<DiagnosisDto, 'matrixNo' | 'nameZh' | 'mappingKind'>>;
}

export const toBlueprintDetailDto = (b: {
  blueprintId: string;
  exerciseName: string;
  indications: string;
  frequency: string;
  gentleReminder: string;
  version: string;
  isHighRisk: boolean;
  region: { regionCode: RegionCode; nameZh: string };
  panels: Array<{
    panelIndex: number;
    stepName: string;
    actionDescription: string;
    timingHint: string | null;
    visualDescription: string | null;
  }>;
  diagnoses: Array<{ matrixNo: number; nameZh: string; mappingKind: MappingKind }>;
}): BlueprintDetailDto => ({
  blueprintId: b.blueprintId,
  regionCode: b.region.regionCode,
  regionNameZh: b.region.nameZh,
  exerciseName: b.exerciseName,
  indications: b.indications,
  frequency: b.frequency,
  gentleReminder: b.gentleReminder,
  version: b.version,
  isHighRisk: b.isHighRisk,
  imageUrl: imageUrlFor(b.blueprintId),
  panels: b.panels.map((p) => ({
    panelIndex: p.panelIndex,
    stepName: p.stepName,
    actionDescription: p.actionDescription,
    timingHint: p.timingHint,
    visualDescription: p.visualDescription,
  })),
  diagnoses: b.diagnoses.map((d) => ({ matrixNo: d.matrixNo, nameZh: d.nameZh, mappingKind: d.mappingKind })),
});

export const toDiagnosisDto = (d: {
  matrixNo: number;
  nameZh: string;
  mappingKind: MappingKind;
  mappedBlueprint: { blueprintId: string } | null;
}): DiagnosisDto => ({
  matrixNo: d.matrixNo,
  nameZh: d.nameZh,
  mappingKind: d.mappingKind,
  mappedBlueprintId: d.mappedBlueprint?.blueprintId ?? null,
});

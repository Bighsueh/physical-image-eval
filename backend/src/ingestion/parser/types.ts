import { z } from 'zod';

/**
 * Zod-checked value objects produced by the parsers (research D1/D2). Pure shapes — NO DB contact.
 * Optional fields (timingHint/visualDescription) may be null; required ones are validated as
 * present-string here, but the NON-EMPTY business invariants (FR-006/FR-007) live in invariants.ts
 * so a failure is reported (located) rather than thrown during parse.
 */

export const RegionCodeSchema = z.enum(['S', 'H', 'E', 'T', 'P', 'K', 'L', 'Y']);
export type ParsedRegionCode = z.infer<typeof RegionCodeSchema>;

export const ParsedPanelSchema = z.object({
  // Any positive index parses; "exactly {1,2,3,4}" is an INVARIANT (FR-004), reported not thrown.
  panelIndex: z.number().int().positive(),
  stepName: z.string(),
  actionDescription: z.string(),
  timingHint: z.string().nullable(),
  visualDescription: z.string().nullable(),
});
export type ParsedPanel = z.infer<typeof ParsedPanelSchema>;

export const ParsedBlueprintSchema = z.object({
  blueprintId: z.string(),
  regionCode: RegionCodeSchema,
  exerciseName: z.string(),
  indications: z.string(),
  frequency: z.string(),
  gentleReminder: z.string(),
  version: z.string(),
  aiPrompt: z.string(),
  panels: z.array(ParsedPanelSchema),
  /// Diagnosis names from the per-blueprint `> 涵蓋診斷：…` line (cross-check only, D2).
  coveredDiagnosisNames: z.array(z.string()),
  imagePath: z.string(),
  sourceMarkdownRef: z.string(),
  contentHash: z.string(),
});
export type ParsedBlueprint = z.infer<typeof ParsedBlueprintSchema>;

export const MappingKindSchema = z.enum(['MAPPED', 'TEMPLATE', 'REFERRAL']);
export type ParsedMappingKind = z.infer<typeof MappingKindSchema>;

export const ParsedDiagnosisSchema = z.object({
  matrixNo: z.number().int().positive(),
  nameZh: z.string(),
  mappingKind: MappingKindSchema,
  mappedBlueprintId: z.string().nullable(),
});
export type ParsedDiagnosis = z.infer<typeof ParsedDiagnosisSchema>;

export interface ParsedCatalog {
  blueprints: ParsedBlueprint[];
  diagnoses: ParsedDiagnosis[];
  /** Blueprint IDs the source index declares in its region tables (FR-002 expected set). */
  indexBlueprintIds: string[];
  /** Image filenames discovered under the source, used for the orphan check (FR-005). */
  imageInventory: string[];
  /** Top-level folders that belong to no known region (reported as warnings). */
  unknownFolders: string[];
}

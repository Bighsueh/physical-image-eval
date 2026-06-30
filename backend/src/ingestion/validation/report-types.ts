import type { RegionCode } from '@prisma/client';

/**
 * Ingestion report shape (research "Report shape"). Errors are FATAL and located by
 * blueprintId/panelIndex/diagnosisNo (SC-004); warnings are non-fatal and kept distinct (FR-021).
 */

export interface ReportError {
  invariant: string;
  blueprintId?: string;
  panelIndex?: number;
  diagnosisNo?: number;
  message: string;
}

export interface ReportWarning {
  blueprintId?: string;
  panelIndex?: number;
  message: string;
}

export interface ReportDiff {
  added: string[];
  modified: string[];
  removed: string[];
}

export interface IngestReport {
  ok: boolean;
  counts: { blueprints: number; perRegion: Record<RegionCode, number> };
  reconciliation: { total: number; mapped: number; template: number; referral: number };
  highRisk: string[];
  warnings: ReportWarning[];
  errors: ReportError[];
  diff?: ReportDiff;
}

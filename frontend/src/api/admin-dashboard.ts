import { apiFetch } from './client';

/** Wire types for the 004 admin dashboard (read-only; zh-TW enum values verbatim). */
export interface OverviewData {
  activeReviewerCount: number;
  expectedSubmissions: number;
  submittedActive: number;
  percent: number;
  inactiveSubmittedTotal: number;
  fullyCoveredCount: number;
  blueprintsWithRedoCount: number;
  highRiskCount: number;
  totalBlueprints: number;
}
export interface ReviewerRow {
  accountId: string;
  displayName: string;
  isActive: boolean;
  submittedCount: number;
  total: number;
  unreviewedBlueprintIds: string[];
  lastSubmittedBlueprintId: string | null;
  lastSubmittedAt: string | null;
}
export interface ImageRow {
  blueprintId: string;
  exerciseName: string;
  regionCode: string;
  isHighRisk: boolean;
  submittedActiveCount: number;
  missingReviewers: { accountId: string; displayName: string }[];
  fullCoverage: boolean;
  distribution: { 通過: number; 需小修: number; 需重做: number };
  hasRedo: boolean;
  inactiveSubmittedCount: number;
}
export interface DrillDownRow {
  accountId: string;
  displayName: string;
  isActive: boolean;
  overallJudgement: string | null;
  indicationJudgement: string | null;
  submittedAt: string | null;
}
export interface DrillDownData {
  blueprintId: string;
  summary: ImageRow;
  rows: DrillDownRow[];
  hasDisagreement: boolean;
}

export interface ImageFilters {
  hasRedo?: boolean;
  highRisk?: boolean;
  notFullyCovered?: boolean;
}

const filterQuery = (f: ImageFilters): string => {
  const qs = new URLSearchParams();
  if (f.hasRedo) qs.set('hasRedo', 'true');
  if (f.highRisk) qs.set('highRisk', 'true');
  if (f.notFullyCovered) qs.set('notFullyCovered', 'true');
  return qs.toString() ? `?${qs.toString()}` : '';
};

export const getOverview = () => apiFetch<OverviewData>('/admin/dashboard/overview').then((r) => r.data);

export const getReviewers = () =>
  apiFetch<ReviewerRow[]>('/admin/dashboard/reviewers').then((r) => ({ rows: r.data, meta: r.meta }));

export const getImages = (filters: ImageFilters = {}) =>
  apiFetch<ImageRow[]>(`/admin/dashboard/images${filterQuery(filters)}`).then((r) => ({
    rows: r.data,
    meta: r.meta,
  }));

export const getDrillDown = (blueprintId: string) =>
  apiFetch<DrillDownData>(`/admin/dashboard/images/${blueprintId}`).then((r) => r.data);

/** Download the CSV export (GET → blob → save). No CSRF (read-only GET). */
export const downloadExport = async (filters: ImageFilters = {}): Promise<void> => {
  const res = await fetch(`/api/admin/export/reviews.csv${filterQuery(filters)}`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('匯出失敗');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `review-export-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

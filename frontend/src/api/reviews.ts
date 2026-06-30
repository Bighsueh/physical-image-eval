import { apiFetch } from './client';

/** Wire types for the review API (zh-TW enum values verbatim, per the 003 contract). */
export type OverallJudgement = '通過' | '需小修' | '需重做';
export type IndicationJudgement = '合理' | '有疑慮';
export type WarningType = '注意跌倒' | '需有專人幫助指導' | '骨鬆注意' | '心肺功能不全者注意' | '其它';
export type ProblemType =
  | '部位／主題錯誤'
  | '動作示範錯誤'
  | '文字說明錯誤'
  | '次數／時間不合理'
  | '缺安全提醒'
  | '有錯字';
export type ReviewStatusValue = '未開始' | '草稿' | '已提交';

export const WARNING_OPTIONS: WarningType[] = [
  '注意跌倒',
  '需有專人幫助指導',
  '骨鬆注意',
  '心肺功能不全者注意',
  '其它',
];
export const PROBLEM_OPTIONS: ProblemType[] = [
  '部位／主題錯誤',
  '動作示範錯誤',
  '文字說明錯誤',
  '次數／時間不合理',
  '缺安全提醒',
  '有錯字',
];

export interface PanelDoc {
  panelIndex: number;
  noProblem: boolean;
  requiredWarnings: WarningType[];
  warningOther: string | null;
  problemTypes: ProblemType[];
  problemNote: string | null;
}
export interface ReviewDoc {
  overallJudgement: OverallJudgement | null;
  indicationJudgement: IndicationJudgement | null;
  indicationNote: string | null;
  otherComment: string | null;
  panels: PanelDoc[];
}

export interface BlueprintPanel {
  panelIndex: number;
  stepName: string;
  actionDescription: string;
  timingHint: string | null;
  visualDescription: string | null;
}
export interface ReviewBlueprint {
  blueprintId: string;
  regionCode: string;
  regionNameZh: string;
  exerciseName: string;
  indications: string;
  frequency: string;
  gentleReminder: string;
  isHighRisk: boolean;
  imageUrl: string;
  panels: BlueprintPanel[];
}
export interface ReviewState extends ReviewDoc {
  status: ReviewStatusValue;
  createdAt: string | null;
  lastSavedAt: string | null;
  submittedAt: string | null;
  lastUpdatedAt: string | null;
}
export interface OpenReviewData {
  blueprint: ReviewBlueprint;
  review: ReviewState;
  progress: { submitted: number; total: number };
}
export interface NextData {
  next: string | null;
  completed: boolean;
  submitted: number;
  total: number;
}
export interface SaveData {
  status: ReviewStatusValue;
  lastSavedAt: string | null;
  submittedAt: string | null;
  lastUpdatedAt: string | null;
}
export interface SubmitData {
  status: ReviewStatusValue;
  submittedAt: string | null;
  lastUpdatedAt: string | null;
  next: string | null;
  completed: boolean;
  progress: { submitted: number; total: number };
}
export interface ProgressIndexItem {
  blueprintId: string;
  regionCode: string;
  exerciseName: string;
  isHighRisk: boolean;
  myStatus: ReviewStatusValue;
}
export interface PerRegion {
  regionCode: string;
  regionNameZh: string;
  displayOrder: number;
  total: number;
  submitted: number;
  draft: number;
  notStarted: number;
}
export interface ProgressData {
  submitted: number;
  draft: number;
  notStarted: number;
  total: number;
  perRegion: PerRegion[];
  index: ProgressIndexItem[];
}

export const openReview = (blueprintId: string) =>
  apiFetch<OpenReviewData>(`/reviews/${blueprintId}`).then((r) => r.data);

export const autosaveReview = (blueprintId: string, doc: ReviewDoc) =>
  apiFetch<SaveData>(`/reviews/${blueprintId}`, { method: 'PATCH', body: doc }).then((r) => r.data);

export const submitReview = (blueprintId: string, doc: ReviewDoc) =>
  apiFetch<SubmitData>(`/reviews/${blueprintId}/submit`, { method: 'POST', body: doc }).then((r) => r.data);

export const getNext = () => apiFetch<NextData>('/reviews/next').then((r) => r.data);

export const getProgress = (filters: { region?: string; status?: string } = {}) => {
  const qs = new URLSearchParams();
  if (filters.region) qs.set('region', filters.region);
  if (filters.status) qs.set('status', filters.status);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return apiFetch<ProgressData>(`/reviews/progress${suffix}`).then((r) => r.data);
};

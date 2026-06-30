import {
  IndicationJudgement,
  OverallJudgement,
  ProblemType,
  ReviewStatus,
  WarningType,
} from '@prisma/client';

/**
 * Bidirectional maps between the Prisma enum ids (ASCII) and the verbatim zh-TW wire values
 * (research D2). The DB stores the zh-TW label (via @map); the Prisma client uses the ASCII id;
 * the API transmits zh-TW. These maps convert at the boundary (validation in, DTO out).
 */
export const OVERALL_ID_TO_ZH: Record<OverallJudgement, string> = {
  PASS: '通過',
  MINOR_FIX: '需小修',
  REDO: '需重做',
};
export const INDICATION_ID_TO_ZH: Record<IndicationJudgement, string> = {
  REASONABLE: '合理',
  DOUBTFUL: '有疑慮',
};
export const WARNING_ID_TO_ZH: Record<WarningType, string> = {
  FALL_RISK: '注意跌倒',
  NEEDS_ASSISTANCE: '需有專人幫助指導',
  OSTEOPOROSIS: '骨鬆注意',
  CARDIOPULMONARY: '心肺功能不全者注意',
  OTHER: '其它',
};
export const PROBLEM_ID_TO_ZH: Record<ProblemType, string> = {
  WRONG_SUBJECT: '部位／主題錯誤',
  WRONG_DEMONSTRATION: '動作示範錯誤',
  WRONG_TEXT: '文字說明錯誤',
  UNREASONABLE_FREQ_TIME: '次數／時間不合理',
  MISSING_SAFETY: '缺安全提醒',
  TYPO: '有錯字',
};
export const STATUS_ID_TO_ZH: Record<ReviewStatus, string> = {
  DRAFT: '草稿',
  SUBMITTED: '已提交',
};

const invert = <T extends string>(m: Record<T, string>): Record<string, T> =>
  Object.fromEntries(Object.entries(m).map(([id, zh]) => [zh as string, id as T])) as Record<string, T>;

export const OVERALL_ZH_TO_ID = invert(OVERALL_ID_TO_ZH);
export const INDICATION_ZH_TO_ID = invert(INDICATION_ID_TO_ZH);
export const WARNING_ZH_TO_ID = invert(WARNING_ID_TO_ZH);
export const PROBLEM_ZH_TO_ID = invert(PROBLEM_ID_TO_ZH);
export const STATUS_ZH_TO_ID = invert(STATUS_ID_TO_ZH);

/** The zh-TW wire value sets (used by zod enums). */
export const OVERALL_ZH_VALUES = Object.values(OVERALL_ID_TO_ZH) as [string, ...string[]];
export const INDICATION_ZH_VALUES = Object.values(INDICATION_ID_TO_ZH) as [string, ...string[]];
export const WARNING_ZH_VALUES = Object.values(WARNING_ID_TO_ZH) as [string, ...string[]];
export const PROBLEM_ZH_VALUES = Object.values(PROBLEM_ID_TO_ZH) as [string, ...string[]];
export const STATUS_ZH_VALUES = Object.values(STATUS_ID_TO_ZH) as [string, ...string[]];

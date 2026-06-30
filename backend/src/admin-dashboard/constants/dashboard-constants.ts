import { HIGH_RISK_BLUEPRINT_IDS, TOTAL_BLUEPRINTS } from '../../catalog/constants/catalog-constants';

/**
 * Feature 004 constants. 004 owns no stored entity — it reuses 002's HIGH_RISK_BLUEPRINT_IDS
 * (single source, never re-declared) and 003's zh-TW enum labels verbatim (FR-019). The 27-column
 * CSV header order is fixed here (research D4).
 */
export { HIGH_RISK_BLUEPRINT_IDS, TOTAL_BLUEPRINTS };

export const SET_DELIMITER = '|'; // multi-select set encoding inside one CSV cell (FR-017)

export const FLAG_YES = '是';
export const FLAG_NO = '否';
export const ACTIVE_LABEL = '在職';
export const INACTIVE_LABEL = '非在職';

export const OVERALL_JUDGEMENTS = ['通過', '需小修', '需重做'] as const;
export type OverallJudgementLabel = (typeof OVERALL_JUDGEMENTS)[number];

/** Fixed 27-column export header (FR-014/017, research D4). */
export const EXPORT_HEADER: readonly string[] = [
  '審查者ID',
  '審查者名稱',
  '在職狀態',
  '藍圖ID',
  '藍圖名稱',
  '解剖區域',
  '高風險',
  '整體判定',
  '含需重做',
  '適應症判定',
  '適應症說明',
  '圖1_需要添加的警語',
  '圖1_警語其它',
  '圖1_問題類型',
  '圖1_問題說明',
  '圖2_需要添加的警語',
  '圖2_警語其它',
  '圖2_問題類型',
  '圖2_問題說明',
  '圖3_需要添加的警語',
  '圖3_警語其它',
  '圖3_問題類型',
  '圖3_問題說明',
  '圖4_需要添加的警語',
  '圖4_警語其它',
  '圖4_問題類型',
  '圖4_問題說明',
  '提交時間',
];

import { SET_DELIMITER } from '../constants/dashboard-constants';

/**
 * Encode a multi-select set (需要添加的警語 / 問題類型) as a parseable pipe-delimited list inside one
 * CSV cell (FR-015/017). Empty set ⇒ empty string (an explicit empty cell, the column is always
 * present). Input labels are the verbatim zh-TW enum values.
 */
export const encodeSet = (labels: readonly string[]): string => labels.join(SET_DELIMITER);

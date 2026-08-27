import { env } from '../../config/env';
import { classifyUsage, currentUsageBytes, type UsageClassification } from '../../reviews/photos/services/photo-storage.service';

/**
 * 照片佔用空間 for the dashboard (FR-034).
 *
 * **This is the one photo number on the admin side that includes drafts.** It measures disk
 * consumption, not review progress — a draft's bytes occupy the same space as a submitted
 * one's. Every other photo figure here (work table, 附照片 column, bundle, export) is
 * submitted-only. Called out explicitly so the difference is never mistaken for a bug.
 *
 * The ceiling is displayed here and enforced only by 003's upload route: nothing in 004 blocks
 * anything (FR-037).
 */
export const photoStorageReadonly = {
  async getUsage(): Promise<UsageClassification> {
    return classifyUsage(await currentUsageBytes(), env.PHOTO_STORAGE_LIMIT_BYTES);
  },
};

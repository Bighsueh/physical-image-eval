import { planBundle } from '../services/photo-bundle.service';
import type { AdminPhotoRow } from '../repositories/photo-read.repository';

/**
 * The two columns this amendment APPENDS to the export (FR-032, research D13).
 *
 * Appended, never interleaved: downstream consumers already rely on the existing column
 * contract, and SC-014 requires the old header to remain a strict prefix of the new one. This
 * module therefore knows nothing about the existing serializer and cannot disturb it.
 *
 * Filenames rather than bytes keep the CSV a spreadsheet, and make it the index into the
 * per-image archive — the two artifacts are meant to be read together.
 */
export const PHOTO_COLUMN_HEADERS = ['參考照片張數', '參考照片檔名'] as const;

/** Same delimited-set encoding as the other multi-value columns (research D4). */
const SET_DELIMITER = '；';

/**
 * Photo columns for one (reviewer × blueprint) row. The filenames are exactly the archive entry
 * names, so a row and the zip can be matched without a lookup table (SC-015).
 */
export function photoColumnsFor(
  blueprintCode: string,
  reviewerId: string,
  photosByBlueprint: ReadonlyMap<string, AdminPhotoRow[]>,
): [string, string] {
  const all = photosByBlueprint.get(blueprintCode) ?? [];
  // Names must be planned over the WHOLE blueprint, not this reviewer's subset: the per-slot
  // sequence numbers are what make them unique, and slicing first would renumber them.
  const plan = planBundle(all);
  const mine = new Set(all.filter((p) => p.reviewerId === reviewerId).map((p) => p.id));
  const names = plan.filter((f) => mine.has(f.photoId)).map((f) => f.name);
  return [String(mine.size), names.join(SET_DELIMITER)];
}

import { ZipArchive } from 'archiver';
import type { Response } from 'express';
import { catalogService } from '../../catalog/services/catalog.service';
import { AppError } from '../../lib/errors';
import { photoReadRepository, type AdminPhotoRow } from '../repositories/photo-read.repository';

/**
 * 下載本圖全部材料 — a per-image archive of the reference photos (FR-029/FR-030, research D12).
 *
 * Streamed rather than assembled on disk: 004 otherwise touches no filesystem at all, and a
 * temp-file lifecycle would be the only thing that could leave residue behind. It also stays a
 * `GET`, which is what keeps this feature entirely read-only and CSRF-free.
 *
 * Contents per photo: the **original**, plus the **annotated** version when one exists. The
 * display derivative is a web-viewing artifact and is deliberately excluded — what the repair
 * work needs is the full-resolution material.
 */
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
};

/** Keep archive entry names safe and readable; never derived from a user-supplied filename. */
const safe = (s: string): string => s.replace(/[^\p{L}\p{N}._-]+/gu, '_').slice(0, 40) || 'unnamed';

export interface BundleFile {
  name: string;
  variant: 'original' | 'annotated' | 'originalAsJpeg';
  photoId: string;
}

/**
 * The naming rule (FR-030): 圖 × 分格 × 審查者 × 序號 × 版本別, so an unzipped folder needs no
 * lookup table to be useful. Image-level photos are named 整體 rather than a panel number.
 */
export function planBundle(photos: AdminPhotoRow[]): BundleFile[] {
  const seq = new Map<string, number>();
  const files: BundleFile[] = [];

  for (const p of photos) {
    const slot = p.panelIndex === null ? '整體' : `圖${p.panelIndex}`;
    const who = safe(p.reviewerDisplayName);
    const key = `${slot}|${who}`;
    const n = (seq.get(key) ?? 0) + 1;
    seq.set(key, n);
    const idx = String(n).padStart(2, '0');
    const stem = `${p.blueprintCode}_${slot}_${who}_${idx}`;
    const isHeic = p.originalMimeType === 'image/heic';
    const hasAnnotated = p.annotatedByteSize != null;

    files.push({
      name: `${stem}_原始.${EXT_BY_MIME[p.originalMimeType] ?? 'bin'}`,
      variant: 'original',
      photoId: p.id,
    });
    if (hasAnnotated) {
      files.push({ name: `${stem}_標註.jpg`, variant: 'annotated', photoId: p.id });
    } else if (isHeic) {
      // A HEIC original with no annotated version would leave the archive with nothing most
      // desktop tools can open, so the full-size JPEG produced at upload stands in for it.
      files.push({ name: `${stem}_原始.jpg`, variant: 'originalAsJpeg', photoId: p.id });
    }
  }
  return files;
}

export const photoBundleService = {
  /** Names the archive after the blueprint, so a downloads folder stays legible. */
  async archiveName(blueprintCode: string): Promise<string> {
    const blueprints = await catalogService.listBlueprints({});
    const bp = blueprints.find((b) => b.blueprintId === blueprintCode);
    if (!bp) throw new AppError('BLUEPRINT_NOT_FOUND');
    return `${bp.blueprintId}_${bp.exerciseName}_參考照片.zip`;
  },

  /**
   * Stream the archive into the response. A blueprint with no submitted photos yields a valid
   * EMPTY archive with 200 — an empty result is not an error (FR-021).
   */
  async streamTo(blueprintCode: string, res: Response): Promise<void> {
    const photos = await photoReadRepository.listForBlueprint(blueprintCode);
    const plan = planBundle(photos);

    // Level 1: JPEG/PNG are already compressed, so a higher level costs CPU for nothing.
    const archive = new ZipArchive({ zlib: { level: 1 } });
    archive.on('error', () => res.destroy());
    archive.pipe(res);

    for (const file of plan) {
      const bytes = await photoReadRepository.readBytes(file.photoId, file.variant);
      if (bytes) archive.append(bytes, { name: file.name });
    }
    await archive.finalize();
  },
};

import type { RequestHandler } from 'express';
import { ok } from '../../lib/envelope';
import { AppError } from '../../lib/errors';
import { photoReadRepository } from '../repositories/photo-read.repository';
import { photoBundleService } from '../services/photo-bundle.service';
import { photoStorageReadonly } from '../services/photo-storage.readonly';
import { workTableService } from '../services/work-table.service';
import { dashboardBlueprintIdSchema } from '../validation/dashboard.schema';
import { photoVariantSchema } from '../../reviews/photos/validation/review-photo.schema';

/**
 * Admin-side photo endpoints — all GET, all read-only, no CSRF (004 has no state-changing
 * request at all). Every one resolves photos through the submitted-only repository, so a draft
 * photo is unreachable here by construction (FR-028).
 */
const parseCode = (raw: unknown): string => {
  const parsed = dashboardBlueprintIdSchema.safeParse(raw);
  if (!parsed.success) throw new AppError('INVALID_PARAM');
  return parsed.data;
};

export const workTableHandler: RequestHandler = async (req, res, next) => {
  try {
    res.status(200).json(ok(await workTableService.getWorkTable(parseCode(req.params.blueprintId))));
  } catch (err) {
    next(err);
  }
};

export const adminPhotoFileHandler: RequestHandler = async (req, res, next) => {
  try {
    const variant = photoVariantSchema.parse(req.query.variant);
    const photo = await photoReadRepository.findSubmitted(String(req.params.photoId));
    // A draft photo and an unknown id are reported identically — the code itself must not
    // confirm that a photo exists (FR-028).
    if (!photo) throw new AppError('PHOTO_NOT_FOUND');
    if (variant === 'annotated' && photo.annotatedByteSize == null) {
      throw new AppError('PHOTO_NOT_FOUND');
    }
    const bytes = await photoReadRepository.readBytes(photo.id, variant);
    if (!bytes) throw new AppError('PHOTO_NOT_FOUND');

    res.setHeader('Content-Type', variant === 'original' ? photo.originalMimeType : 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('Content-Disposition', 'inline');
    res.status(200).end(bytes);
  } catch (err) {
    next(err);
  }
};

export const photoBundleHandler: RequestHandler = async (req, res, next) => {
  try {
    const code = parseCode(req.params.blueprintId);
    const filename = await photoBundleService.archiveName(code);
    res.setHeader('Content-Type', 'application/zip');
    // RFC 5987 for the zh-TW filename; the ASCII fallback keeps older clients readable.
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${code}_photos.zip"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    await photoBundleService.streamTo(code, res);
  } catch (err) {
    // Once bytes are on the wire an envelope is no longer possible; close instead of corrupting.
    if (res.headersSent) return void res.destroy();
    next(err);
  }
};

export const storageUsageHandler: RequestHandler = async (_req, res, next) => {
  try {
    const usage = await photoStorageReadonly.getUsage();
    res.status(200).json(
      ok({
        usedBytes: usage.usedBytes,
        limitBytes: usage.limitBytes,
        usedPercent: Number(usage.usedPercent.toFixed(1)),
        warning: usage.warning,
      }),
    );
  } catch (err) {
    next(err);
  }
};

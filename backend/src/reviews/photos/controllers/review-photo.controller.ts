import type { RequestHandler } from 'express';
import { ok } from '../../../lib/envelope';
import { AppError } from '../../../lib/errors';
import { blueprintIdSchema } from '../../validation/review.schema';

/** Always the session reviewer — never a value from the request (research D8, FR-057). */
const reviewerId = (req: Parameters<RequestHandler>[0]): string => req.auth!.account.id;
import { reviewPhotoService } from '../services/review-photo.service';
import {
  photoIdSchema,
  photoPatchSchema,
  photoUploadFieldsSchema,
  photoVariantSchema,
} from '../validation/review-photo.schema';

/**
 * Reference-photo endpoints. Thin: validate → service → envelope, exactly like the review
 * controller. `reviewerId` always comes from the session (`req.account`), never the request.
 */

type MulterFiles = Record<string, Express.Multer.File[]> | undefined;

const parseCode = (raw: unknown): string => {
  const parsed = blueprintIdSchema.safeParse(raw);
  if (!parsed.success) throw new AppError('INVALID_PARAM');
  return parsed.data;
};

const parsePhotoId = (raw: unknown): string => {
  const parsed = photoIdSchema.safeParse(raw);
  if (!parsed.success) throw new AppError('INVALID_PARAM');
  return parsed.data;
};

const requirePart = (files: MulterFiles, name: string): Buffer => {
  const file = files?.[name]?.[0];
  if (!file) throw new AppError('VALIDATION_ERROR');
  return file.buffer;
};

const optionalPart = (files: MulterFiles, name: string): Buffer | null =>
  files?.[name]?.[0]?.buffer ?? null;

export const uploadPhotoHandler: RequestHandler = async (req, res, next) => {
  try {
    const code = parseCode(req.params.blueprintId);
    const files = req.files as MulterFiles;
    const fields = photoUploadFieldsSchema.parse(req.body ?? {});
    const result = await reviewPhotoService.upload(
      reviewerId(req),
      code,
      {
        original: requirePart(files, 'original'),
        display: requirePart(files, 'display'),
        originalAsJpeg: optionalPart(files, 'originalAsJpeg'),
      },
      fields,
    );
    res.status(201).json(ok(result));
  } catch (err) {
    next(err);
  }
};

export const deletePhotoHandler: RequestHandler = async (req, res, next) => {
  try {
    await reviewPhotoService.remove(
      reviewerId(req),
      parseCode(req.params.blueprintId),
      parsePhotoId(req.params.photoId),
    );
    res.status(200).json(ok({ deleted: true }));
  } catch (err) {
    next(err);
  }
};

export const patchPhotoHandler: RequestHandler = async (req, res, next) => {
  try {
    const photo = await reviewPhotoService.updateMeta(
      reviewerId(req),
      parseCode(req.params.blueprintId),
      parsePhotoId(req.params.photoId),
      photoPatchSchema.parse(req.body ?? {}),
    );
    res.status(200).json(ok({ photo }));
  } catch (err) {
    next(err);
  }
};

export const photoFileHandler: RequestHandler = async (req, res, next) => {
  try {
    parseCode(req.params.blueprintId);
    const variant = photoVariantSchema.parse(req.query.variant);
    const { bytes, contentType } = await reviewPhotoService.readVariant(
      reviewerId(req),
      parsePhotoId(req.params.photoId),
      variant,
    );
    res.setHeader('Content-Type', contentType);
    // Reviewer-scoped content: never let a shared cache hold it (constitution V).
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('Content-Disposition', 'inline');
    res.status(200).end(bytes);
  } catch (err) {
    next(err);
  }
};

export const getAnnotationHandler: RequestHandler = async (req, res, next) => {
  try {
    parseCode(req.params.blueprintId);
    const annotationState = await reviewPhotoService.getAnnotation(
      reviewerId(req),
      parsePhotoId(req.params.photoId),
    );
    res.status(200).json(ok({ annotationState }));
  } catch (err) {
    next(err);
  }
};

export const putAnnotationHandler: RequestHandler = async (req, res, next) => {
  try {
    const files = req.files as MulterFiles;
    const rawState = typeof req.body?.annotationState === 'string' ? req.body.annotationState : null;
    if (!rawState) throw new AppError('VALIDATION_ERROR');
    let annotationState: unknown;
    try {
      annotationState = JSON.parse(rawState);
    } catch {
      throw new AppError('VALIDATION_ERROR');
    }
    const photo = await reviewPhotoService.saveAnnotation(
      reviewerId(req),
      parseCode(req.params.blueprintId),
      parsePhotoId(req.params.photoId),
      requirePart(files, 'annotated'),
      annotationState as never,
    );
    res.status(200).json(ok({ photo }));
  } catch (err) {
    next(err);
  }
};

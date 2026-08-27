import { Router } from 'express';
import multer from 'multer';
import { env } from '../../../config/env';
import { AppError } from '../../../lib/errors';
import { csrfProtection } from '../../../middleware/csrf';
import {
  deletePhotoHandler,
  getAnnotationHandler,
  patchPhotoHandler,
  photoFileHandler,
  putAnnotationHandler,
  uploadPhotoHandler,
} from '../controllers/review-photo.controller';

/**
 * Reference-photo routes, mounted on the existing `/api/reviews` router so they inherit its
 * `requireAuth` + `requireRole('REVIEWER')` + `requirePasswordCurrent` guard chain. Mutations
 * additionally carry CSRF — the double-submit header check works unchanged with multipart
 * because it reads `X-CSRF-Token`, not the body.
 *
 * **Memory storage on purpose**: the bytes go straight into a `bytea` column, so a disk
 * round-trip would buy nothing. The per-file cap is what keeps that safe.
 */
export const reviewPhotoRouter = Router({ mergeParams: true });

/**
 * The limit is read per request rather than captured at module load, so a test (or an operator
 * changing the ceiling) sees the current value.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    get fileSize() {
      return env.PHOTO_MAX_FILE_BYTES;
    },
    files: 3,
  },
});

/** Translate multer's own errors into the project envelope rather than leaking them. */
const handleUpload = (fields: multer.Field[]): ReturnType<typeof Router> => {
  const router = Router({ mergeParams: true });
  router.use((req, res, next) => {
    upload.fields(fields)(req, res, (err: unknown) => {
      if (!err) return next();
      const code = (err as { code?: string }).code;
      if (code === 'LIMIT_FILE_SIZE') return next(new AppError('IMAGE_TOO_LARGE'));
      if (code === 'LIMIT_FILE_COUNT' || code === 'LIMIT_UNEXPECTED_FILE') {
        return next(new AppError('VALIDATION_ERROR'));
      }
      return next(err);
    });
  });
  return router;
};

const uploadParts = handleUpload([
  { name: 'original', maxCount: 1 },
  { name: 'display', maxCount: 1 },
  { name: 'originalAsJpeg', maxCount: 1 },
]);
const annotationParts = handleUpload([{ name: 'annotated', maxCount: 1 }]);

// Literal segments before the parameterized ones, matching the parent router's convention.
reviewPhotoRouter.post('/:blueprintId/photos', csrfProtection, uploadParts, uploadPhotoHandler);
reviewPhotoRouter.get('/:blueprintId/photos/:photoId/file', photoFileHandler);
reviewPhotoRouter.get('/:blueprintId/photos/:photoId/annotation', getAnnotationHandler);
reviewPhotoRouter.put(
  '/:blueprintId/photos/:photoId/annotation',
  csrfProtection,
  annotationParts,
  putAnnotationHandler,
);
reviewPhotoRouter.patch('/:blueprintId/photos/:photoId', csrfProtection, patchPhotoHandler);
reviewPhotoRouter.delete('/:blueprintId/photos/:photoId', csrfProtection, deletePhotoHandler);

import { constants as fsConstants } from 'node:fs';
import { access } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { Router } from 'express';
import { BLUEPRINT_ID_REGEX } from '../../catalog/constants/catalog-constants';
import { catalogRepository } from '../../catalog/repositories/catalog.repository';
import { env } from '../../config/env';
import { AppError } from '../../lib/errors';
import { requireAuth } from '../../middleware/require-auth';
import { requirePasswordCurrent } from '../../middleware/require-password-current';

/**
 * Read-only blueprint image route (D5). Resolves the stored relative imagePath under
 * IMAGE_SOURCE_DIR, asserts the resolved path stays inside that root (no traversal), opens
 * READ-ONLY and streams image/png (constitution II — never writes/renames/deletes). Guards per
 * route so unmatched paths fall through to the 404 handler.
 */
export const imageRouter = Router();

imageRouter.get(
  '/blueprints/:blueprintId/image',
  requireAuth,
  requirePasswordCurrent,
  async (req, res, next) => {
    try {
      const id = req.params.blueprintId;
      if (!BLUEPRINT_ID_REGEX.test(id)) throw new AppError('INVALID_PARAM');

      const row = await catalogRepository.imagePathFor(id);
      if (!row) throw new AppError('BLUEPRINT_NOT_FOUND');

      // Pre-reject an implausible stored path independent of IMAGE_SOURCE_DIR depth (SEC-M2).
      if (!row.imagePath || isAbsolute(row.imagePath) || row.imagePath.split('/').includes('..')) {
        throw new AppError('INVALID_PARAM');
      }

      const root = resolve(env.IMAGE_SOURCE_DIR);
      const full = resolve(root, row.imagePath);
      const rel = relative(root, full);
      if (rel.startsWith('..') || isAbsolute(rel)) throw new AppError('INVALID_PARAM'); // traversal guard

      // Async readability check (non-blocking); createReadStream also surfaces late errors below.
      await access(full, fsConstants.R_OK).catch(() => {
        throw new AppError('IMAGE_NOT_FOUND');
      });

      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'private, max-age=3600');
      const stream = createReadStream(full); // read-only
      stream.on('error', () => {
        if (!res.headersSent) next(new AppError('IMAGE_NOT_FOUND'));
        else res.destroy(); // headers already committed — close the socket cleanly
      });
      stream.pipe(res);
    } catch (err) {
      next(err);
    }
  },
);

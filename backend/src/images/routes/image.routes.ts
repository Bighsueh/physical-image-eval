import { createReadStream, existsSync } from 'node:fs';
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
 * READ-ONLY and streams image/png (constitution II — never writes/renames/deletes).
 */
export const imageRouter = Router();

// Guards per route (not router-wide) so unmatched paths fall through to the 404 handler.
imageRouter.get('/blueprints/:blueprintId/image', requireAuth, requirePasswordCurrent, async (req, res, next) => {
  try {
    const id = req.params.blueprintId;
    if (!BLUEPRINT_ID_REGEX.test(id)) throw new AppError('INVALID_PARAM');

    const row = await catalogRepository.imagePathFor(id);
    if (!row) throw new AppError('BLUEPRINT_NOT_FOUND');

    const root = resolve(env.IMAGE_SOURCE_DIR);
    const full = resolve(root, row.imagePath);
    const rel = relative(root, full);
    if (rel.startsWith('..') || isAbsolute(rel)) throw new AppError('INVALID_PARAM'); // traversal guard
    if (!existsSync(full)) throw new AppError('IMAGE_NOT_FOUND');

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    const stream = createReadStream(full); // read-only
    stream.on('error', () => next(new AppError('IMAGE_NOT_FOUND')));
    stream.pipe(res);
  } catch (err) {
    next(err);
  }
});

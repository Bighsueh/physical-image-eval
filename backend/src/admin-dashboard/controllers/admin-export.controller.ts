import type { RequestHandler } from 'express';
import { AppError } from '../../lib/errors';
import { EXPORT_HEADER } from '../constants/dashboard-constants';
import { serializeCsv } from '../csv/csv-serializer';
import { PHOTO_COLUMN_HEADERS } from '../csv/export-photo-columns';
import { exportService } from '../services/export.service';
import { exportFilterSchema } from '../validation/dashboard.schema';

/**
 * CSV export of all submitted reviews (FR-013..017). Read-only projection; errors still use the
 * JSON envelope (via next()). The body is UTF-8+BOM, CRLF, RFC-4180 (serializer).
 */
export const exportCsvHandler: RequestHandler = async (req, res, next) => {
  try {
    const q = exportFilterSchema.safeParse(req.query);
    if (!q.success) throw new AppError('INVALID_PARAM');
    const rows = await exportService.buildRows(q.data);
    // The photo columns are APPENDED here rather than folded into EXPORT_HEADER, so that
    // constant keeps meaning exactly "the columns buildExportRow emits" — which is what the
    // pre-existing tests assert. The old header stays a strict prefix of the new one (SC-014).
    const body = serializeCsv([...EXPORT_HEADER, ...PHOTO_COLUMN_HEADERS], rows);
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="review-export-${stamp}.csv"`);
    res.status(200).send(body);
  } catch (err) {
    next(err);
  }
};

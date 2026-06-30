import type { RequestHandler } from 'express';
import { AppError } from '../../lib/errors';
import { EXPORT_HEADER } from '../constants/dashboard-constants';
import { serializeCsv } from '../csv/csv-serializer';
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
    const body = serializeCsv(EXPORT_HEADER, rows);
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="review-export-${stamp}.csv"`);
    res.status(200).send(body);
  } catch (err) {
    next(err);
  }
};

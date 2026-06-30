import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../../src/app';
import { env } from '../../../src/config/env';
import { runIngest } from '../../../src/ingestion/runner';
import { prisma } from '../../../src/lib/prisma';
import { EXPORT_HEADER } from '../../../src/admin-dashboard/constants/dashboard-constants';
import { adminAgent } from '../../helpers/http';
import { seedDashboard } from '../../helpers/dashboard-seed';

const parseRows = (csv: string): string[] =>
  (csv.charCodeAt(0) === 0xfeff ? csv.slice(1) : csv).split('\r\n').filter((l) => l.length > 0);

describe('admin CSV export (US2)', () => {
  let admin: Awaited<ReturnType<typeof adminAgent>>;
  beforeAll(async () => {
    await runIngest({ sourceDir: env.IMAGE_SOURCE_DIR });
  });
  beforeEach(async () => {
    await seedDashboard();
    admin = await adminAgent(app);
  });

  it('streams a BOM CSV with the fixed 27-column header and submitted-only rows (0 drafts)', async () => {
    const res = await admin.agent.get('/api/admin/export/reviews.csv');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="review-export-.*\.csv"/);
    expect(res.text.charCodeAt(0)).toBe(0xfeff); // BOM

    const lines = parseRows(res.text);
    expect(lines[0]).toBe(EXPORT_HEADER.join(','));
    expect(lines).toHaveLength(1 + 4); // header + 4 submitted (R1×2, R2×1, R4×1); the S3 draft excluded
    expect(res.text).not.toContain('S3'); // draft blueprint never appears
    // 非在職 reviewer flagged, redo row present
    expect(res.text).toContain('非在職');
    expect(res.text).toContain('需重做');
  });

  it('hasRedo filter narrows rows but keeps the 27-column structure', async () => {
    const res = await admin.agent.get('/api/admin/export/reviews.csv?hasRedo=true');
    const lines = parseRows(res.text);
    expect(lines[0].split(',')).toHaveLength(EXPORT_HEADER.length);
    // only S1 rows (S1 has the 需重做); S2 (no redo) excluded
    expect(lines.slice(1).every((l) => l.includes(',S1,'))).toBe(true);
    expect((await admin.agent.get('/api/admin/export/reviews.csv?hasRedo=nope')).status).toBe(400);
  });

  it('is read-only — review row count is unchanged after export', async () => {
    const before = await prisma.review.count();
    await admin.agent.get('/api/admin/export/reviews.csv');
    await admin.agent.get('/api/admin/dashboard/overview');
    expect(await prisma.review.count()).toBe(before);
  });

  it('empty state → header-only CSV, no error', async () => {
    await prisma.review.deleteMany();
    await prisma.account.deleteMany({ where: { role: 'REVIEWER' } });
    const res = await admin.agent.get('/api/admin/export/reviews.csv');
    expect(res.status).toBe(200);
    expect(parseRows(res.text)).toHaveLength(1); // header only
  });
});

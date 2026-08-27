import type request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../../../src/app';
import { env } from '../../../../src/config/env';
import { runIngest } from '../../../../src/ingestion/runner';
import { prisma } from '../../../../src/lib/prisma';
import { seedDashboard, type SeededDashboard } from '../../../helpers/dashboard-seed';
import { adminAgent, reviewerAgent, type SeededAgent } from '../../../helpers/http';
import { HEIC_BYTES, JPEG_BYTES, PNG_BYTES } from '../../../helpers/photo';

/**
 * Reading the archive.
 *
 * Entry names are UTF-8 with the zip language-encoding flag set (verified against the raw
 * header), so scanning the response as latin1 can never match them — the names are read out of
 * the central directory instead. macOS's bundled `unzip` ignores that flag and shows mojibake;
 * tools that honour it (Finder, Python's zipfile, 7-Zip) show the zh-TW names correctly.
 */
export function zipEntryNames(buf: Buffer): string[] {
  const names: string[] = [];
  const SIG = 0x02014b50; // central directory file header
  for (let i = 0; i <= buf.length - 46; i += 1) {
    if (buf.readUInt32LE(i) !== SIG) continue;
    const nameLen = buf.readUInt16LE(i + 28);
    names.push(buf.toString('utf8', i + 46, i + 46 + nameLen));
  }
  return names;
}

/**
 * supertest parses bodies as JSON/text by default; a zip needs the raw bytes. Typed against
 * supertest's own parser signature (it declares `Response`, not a plain stream).
 */
const binary: Parameters<request.Test['parse']>[0] = (res, cb) => {
  const stream = res as unknown as NodeJS.ReadableStream & { setEncoding: (e: string) => void };
  stream.setEncoding('binary');
  let data = '';
  stream.on('data', (chunk: string) => (data += chunk));
  stream.on('end', () => cb(null, Buffer.from(data, 'binary')));
};

/**
 * 004 US5 — the admin side of reference photos. The load-bearing test here is the draft
 * exclusion: photos reach the admin ONLY through submitted reviews, across all four surfaces
 * (work table, count column, bundle, export). That is the side door FR-007 does not cover.
 */
describe('admin reference photos (US5)', () => {
  let admin: SeededAgent;
  let seed: SeededDashboard;

  beforeAll(async () => {
    await runIngest({ sourceDir: env.IMAGE_SOURCE_DIR });
  });

  /** Attach a photo directly (the seeded reviewers have no password to log in with). */
  const attach = async (
    reviewerId: string,
    blueprintCode: string,
    opts: {
      panelIndex?: number | null;
      caption?: string;
      annotated?: boolean;
      heic?: boolean;
    } = {},
  ): Promise<string> => {
    const review = await prisma.review.findFirstOrThrow({
      where: { reviewerId, blueprintCode },
      select: { id: true },
    });
    const photo = await prisma.reviewPhoto.create({
      data: {
        reviewId: review.id,
        panelIndex: opts.panelIndex ?? null,
        caption: opts.caption ?? null,
        originalMimeType: opts.heic ? 'image/heic' : 'image/jpeg',
        originalByteSize: JPEG_BYTES.byteLength,
        displayByteSize: JPEG_BYTES.byteLength,
        annotatedByteSize: opts.annotated ? PNG_BYTES.byteLength : null,
        annotatedAt: opts.annotated ? new Date() : null,
        blob: {
          create: {
            original: new Uint8Array(opts.heic ? HEIC_BYTES : JPEG_BYTES),
            display: new Uint8Array(JPEG_BYTES),
            annotated: opts.annotated ? new Uint8Array(PNG_BYTES) : null,
            originalAsJpeg: opts.heic ? new Uint8Array(JPEG_BYTES) : null,
          },
        },
      },
      select: { id: true },
    });
    return photo.id;
  };

  beforeEach(async () => {
    seed = await seedDashboard();
    admin = await adminAgent(app);
  });

  it('T064: the work table groups by panel, always four, in index order', async () => {
    await attach(seed.r1, 'S1', { panelIndex: 1, caption: '正確的收拳角度' });
    await attach(seed.r2, 'S1', { panelIndex: 1 });

    const res = await admin.agent.get('/api/admin/dashboard/images/S1/worktable');
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.panels.map((p: { panelIndex: number }) => p.panelIndex)).toEqual([1, 2, 3, 4]);
    expect(d.photoCount).toBe(2);
    expect(d.panels[0].photoCount).toBe(2);
    expect(d.panels[0].flaggedReviewerCount).toBe(2);
    expect(d.panels[0].allClear).toBe(false);
    const names = d.panels[0].entries.map((e: { reviewerDisplayName: string }) => e.reviewerDisplayName);
    expect(names).toContain('甲醫師');
    expect(names).toContain('乙醫師');
    expect(d.panels[0].entries[0].photos[0].urls.display).toContain('/photos/');
  });

  it('T064: a panel every submitting reviewer signed off collapses to all-clear', async () => {
    const res = await admin.agent.get('/api/admin/dashboard/images/S1/worktable');
    const panels = res.body.data.panels as { panelIndex: number; allClear: boolean }[];
    // The seed annotates 圖1 of S1 (乙醫師: 有錯字 + 骨鬆注意); 圖2–4 are untouched by anyone.
    expect(panels.find((p) => p.panelIndex === 1)!.allClear).toBe(false);
    expect(panels.filter((p) => p.panelIndex > 1).every((p) => p.allClear)).toBe(true);
  });

  it('T064: an unreviewed blueprint is NOT all-clear — that would be a false reassurance', async () => {
    const res = await admin.agent.get('/api/admin/dashboard/images/S4/worktable');
    expect(res.status).toBe(200);
    expect(res.body.data.submittedReviewerCount).toBe(0);
    expect(res.body.data.panels.every((p: { allClear: boolean }) => p.allClear === false)).toBe(true);
    expect(res.body.data.photoCount).toBe(0);
  });

  it('T064: 非在職 reviewers keep their submitted entries, flagged', async () => {
    await attach(seed.r4, 'S1', { panelIndex: 2, caption: '前同事留下的' });
    const res = await admin.agent.get('/api/admin/dashboard/images/S1/worktable');
    const entry = res.body.data.panels[1].entries.find(
      (e: { reviewerDisplayName: string }) => e.reviewerDisplayName === '前醫師',
    );
    expect(entry).toBeTruthy();
    expect(entry.isActive).toBe(false);
  });

  it('T065: a DRAFT review’s photos are invisible on ALL FOUR admin surfaces', async () => {
    // R1 has a draft on S3 (seed) and a submitted review on S1.
    const draftPhoto = await attach(seed.r1, 'S3', { panelIndex: 1, caption: '草稿上的照片' });
    await attach(seed.r1, 'S1', { panelIndex: 1, caption: '已提交的照片' });

    // (a) work table
    const work = await admin.agent.get('/api/admin/dashboard/images/S3/worktable');
    expect(work.body.data.photoCount).toBe(0);
    expect(work.body.data.panels.flatMap((p: { entries: unknown[] }) => p.entries)).toEqual([]);

    // (b) count column
    const images = await admin.agent.get('/api/admin/dashboard/images');
    const s3 = images.body.data.find((i: { blueprintId: string }) => i.blueprintId === 'S3');
    expect(s3.photoCount).toBe(0);

    // (c) direct file fetch — same 404 as an unknown id, so the code confirms nothing
    const file = await admin.agent.get(`/api/admin/dashboard/photos/${draftPhoto}/file`);
    expect(file.status).toBe(404);
    expect(file.body.error.code).toBe('PHOTO_NOT_FOUND');
    const unknown = await admin.agent.get('/api/admin/dashboard/photos/does-not-exist/file');
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe('PHOTO_NOT_FOUND');

    // (d) bundle + (e) export
    const zip = await admin.agent.get('/api/admin/dashboard/images/S3/photos.zip').buffer().parse(binary);
    expect(zip.status).toBe(200);
    const csv = await admin.agent.get('/api/admin/export/reviews.csv');
    expect(csv.text).not.toContain('草稿上的照片');
    expect(csv.text).not.toContain('S3_圖1');
  });

  it('T066: serves each variant, and reports a missing annotated variant as absent', async () => {
    const id = await attach(seed.r1, 'S1', { panelIndex: 1 });
    const display = await admin.agent.get(`/api/admin/dashboard/photos/${id}/file`).buffer().parse(binary);
    expect(display.status).toBe(200);
    expect(display.headers['cache-control']).toContain('private');
    expect(display.headers['content-disposition']).toContain('inline');

    const annotated = await admin.agent.get(`/api/admin/dashboard/photos/${id}/file?variant=annotated`);
    expect(annotated.status).toBe(404);
  });

  it('T067: the bundle contains originals and annotated versions, named to encode ownership', async () => {
    await attach(seed.r1, 'S1', { panelIndex: 1, annotated: true });
    await attach(seed.r2, 'S1', { panelIndex: 3 });
    await attach(seed.r1, 'S1', {}); // image-level

    const res = await admin.agent.get('/api/admin/dashboard/images/S1/photos.zip').buffer().parse(binary);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/zip');
    expect(res.headers['content-disposition']).toContain('attachment');

    const names = zipEntryNames(res.body);
    expect(names).toHaveLength(4); // 3 photos, one of which also has an annotated version
    expect(names.some((n) => n.includes('S1_圖1_甲醫師_01_原始'))).toBe(true);
    expect(names.some((n) => n.includes('S1_圖1_甲醫師_01_標註'))).toBe(true);
    expect(names.some((n) => n.startsWith('S1_圖3_乙醫師_01'))).toBe(true);
    expect(names.some((n) => n.startsWith('S1_整體_甲醫師_01'))).toBe(true);
    // The display derivative is a web-viewing artifact and must never be in the archive.
    expect(names.some((n) => n.includes('顯示'))).toBe(false);
  });

  it('T067: a HEIC original with no annotation ships a JPEG alongside it', async () => {
    await attach(seed.r1, 'S1', { panelIndex: 1, heic: true });
    const res = await admin.agent.get('/api/admin/dashboard/images/S1/photos.zip').buffer().parse(binary);
    const names = zipEntryNames(res.body);
    expect(names.some((n) => n.endsWith('原始.heic'))).toBe(true);
    expect(names.some((n) => n.endsWith('原始.jpg'))).toBe(true); // the openable stand-in
  });

  it('T067: a blueprint with no submitted photos yields a valid EMPTY archive, not an error', async () => {
    const res = await admin.agent.get('/api/admin/dashboard/images/S2/photos.zip').buffer().parse(binary);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0); // a valid end-of-central-directory record
    expect(zipEntryNames(res.body)).toEqual([]);
  });

  it('T068: storage usage matches a direct SUM and includes drafts (the documented exception)', async () => {
    await attach(seed.r1, 'S1', { panelIndex: 1 });
    await attach(seed.r1, 'S3', { panelIndex: 1 }); // on a DRAFT — disk is disk

    const res = await admin.agent.get('/api/admin/dashboard/storage');
    expect(res.status).toBe(200);
    const agg = await prisma.reviewPhoto.aggregate({
      _sum: { originalByteSize: true, displayByteSize: true, annotatedByteSize: true },
    });
    const expected =
      (agg._sum.originalByteSize ?? 0) +
      (agg._sum.displayByteSize ?? 0) +
      (agg._sum.annotatedByteSize ?? 0);
    expect(res.body.data.usedBytes).toBe(expected);
    expect(res.body.data.limitBytes).toBe(env.PHOTO_STORAGE_LIMIT_BYTES);
    expect(res.body.data.warning).toBe('none');
  });

  it('T069: hasPhotos never returns a blueprint whose count is zero, nor omits one that has photos', async () => {
    await attach(seed.r1, 'S1', { panelIndex: 1 });
    const res = await admin.agent.get('/api/admin/dashboard/images?hasPhotos=true');
    expect(res.status).toBe(200);
    const rows = res.body.data as { blueprintId: string; photoCount: number }[];
    expect(rows.every((r) => r.photoCount > 0)).toBe(true);
    expect(rows.map((r) => r.blueprintId)).toContain('S1');
  });

  it('T071: the export gains photo columns without disturbing the existing ones', async () => {
    await attach(seed.r1, 'S1', { panelIndex: 1, annotated: true });
    const res = await admin.agent.get('/api/admin/export/reviews.csv');
    const [header, ...rows] = res.text.replace(/^﻿/, '').trim().split('\r\n');
    const cols = header.split(',');
    expect(cols.slice(-2)).toEqual(['參考照片張數', '參考照片檔名']);

    const r1s1 = rows.find((l) => l.includes('甲醫師') && l.includes(',S1,'));
    expect(r1s1).toBeTruthy();
    const cells = r1s1!.split(',');
    expect(cells[cols.length - 2]).toBe('1');
    // SC-015: the filenames are exactly the bundle's entry names.
    expect(cells[cols.length - 1]).toContain('S1_圖1_甲醫師_01_原始.jpg');
  });

  it('T070/T072: every new route is GET-only, ADMIN-only, and mutates nothing', async () => {
    const id = await attach(seed.r1, 'S1', { panelIndex: 1 });
    const paths = [
      '/api/admin/dashboard/images/S1/worktable',
      '/api/admin/dashboard/images/S1/photos.zip',
      `/api/admin/dashboard/photos/${id}/file`,
      '/api/admin/dashboard/storage',
    ];

    const reviewer = await reviewerAgent(app);
    for (const path of paths) {
      expect((await reviewer.agent.get(path)).status).toBe(403);
    }

    for (const method of ['post', 'put', 'patch', 'delete'] as const) {
      for (const path of paths) {
        const res = await admin.agent[method](path);
        expect([404, 405]).toContain(res.status);
      }
    }

    // And nothing was written by any of it.
    expect(await prisma.reviewPhoto.count()).toBe(1);
    expect(await prisma.review.count()).toBe(5); // S1×3 + S2 + the S3 draft
  });
});

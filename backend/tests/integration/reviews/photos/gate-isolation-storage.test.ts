import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../../../src/app';
import { env } from '../../../../src/config/env';
import { runIngest } from '../../../../src/ingestion/runner';
import { prisma } from '../../../../src/lib/prisma';
import { reviewerAgent, type SeededAgent } from '../../../helpers/http';
import { cleanDoc, emptyDoc, emptyPanels } from '../../../helpers/review';
import { JPEG_BYTES, uploadPhoto } from '../../../helpers/photo';

/**
 * US8 — the three properties that are easy to get wrong: the photo-aware submit gate
 * (T106, incl. the race), cross-reviewer isolation (T107), reset cascade (T108) and the
 * storage ceiling's scope (T109).
 */
describe('reference photos — gate, isolation, reset, ceiling (US8)', () => {
  let r: SeededAgent;
  beforeAll(async () => {
    await runIngest({ sourceDir: env.IMAGE_SOURCE_DIR });
  });
  beforeEach(async () => {
    r = await reviewerAgent(app);
  });

  const submit = (agent: SeededAgent, code: string, body: object) =>
    agent.agent.post(`/api/reviews/${code}/submit`).set('X-CSRF-Token', agent.csrf).send(body);

  /** 通過 with three panels signed off and one deliberately left blank. */
  const docWithBlankPanel = (blank: number) =>
    emptyDoc({
      overallJudgement: '需小修',
      panels: emptyPanels().map((p) => ({ ...p, noProblem: p.panelIndex !== blank })),
    });

  it('T106: a panel whose only evidence is a photo satisfies the submit gate', async () => {
    await uploadPhoto(r, 'S1', { panelIndex: 2 });
    const res = await submit(r, 'S1', docWithBlankPanel(2));
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('已提交');
  });

  it('T106: without the photo, the same document is blocked', async () => {
    const res = await submit(r, 'S1', docWithBlankPanel(2));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('PANEL_REVIEW_INCOMPLETE');
  });

  it('T106 (race): upload then submit immediately — no autosave in between — still passes', async () => {
    // This is the case a document-only gate gets wrong: the photo is persisted by its own
    // endpoint while the debounced PATCH has not fired, so the submitted document shows the
    // panel blank. The gate must read photo counts inside the submit transaction.
    await uploadPhoto(r, 'S3', { panelIndex: 4 });
    const res = await submit(r, 'S3', docWithBlankPanel(4));
    expect(res.status).toBe(200);
  });

  it('T106: an image-level photo does NOT satisfy a panel', async () => {
    await uploadPhoto(r, 'S1', {}); // panelIndex null
    const res = await submit(r, 'S1', docWithBlankPanel(1));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('PANEL_REVIEW_INCOMPLETE');
  });

  it('T107: another reviewer gets 404 (never 403) on every photo route', async () => {
    const up = await uploadPhoto(r, 'S1', { panelIndex: 1 });
    const id = up.body.data.photo.id;

    const other = await reviewerAgent(app);
    const get = await other.agent.get(`/api/reviews/S1/photos/${id}/file`);
    expect(get.status).toBe(404);
    expect(get.body.error.code).toBe('PHOTO_NOT_FOUND');

    const del = await other.agent
      .delete(`/api/reviews/S1/photos/${id}`)
      .set('X-CSRF-Token', other.csrf);
    expect(del.status).toBe(404);

    const patch = await other.agent
      .patch(`/api/reviews/S1/photos/${id}`)
      .set('X-CSRF-Token', other.csrf)
      .send({ caption: 'hijack' });
    expect(patch.status).toBe(404);

    const ann = await other.agent.get(`/api/reviews/S1/photos/${id}/annotation`);
    expect(ann.status).toBe(404);

    // And B never sees A's photos when opening the same blueprint.
    const open = await other.agent.get('/api/reviews/S1');
    expect(open.body.data.review.photos).toEqual([]);
  });

  it('T108: reset deletes the review, its photos and their bytes — no orphans', async () => {
    await uploadPhoto(r, 'S1', { panelIndex: 1 });
    await uploadPhoto(r, 'S1', { panelIndex: 2 });
    expect(await prisma.reviewPhoto.count()).toBe(2);

    const res = await r.agent.post('/api/reviews/S1/reset').set('X-CSRF-Token', r.csrf);
    expect(res.status).toBe(200);
    expect(res.body.data.review.status).toBe('未開始');

    expect(await prisma.reviewPhoto.count()).toBe(0);
    const orphans = await prisma.reviewPhotoBlob.count();
    expect(orphans).toBe(0);
  });

  it('T109: a full store blocks photo uploads ONLY — review work continues', async () => {
    await uploadPhoto(r, 'S1', { panelIndex: 1 });
    const existing = await r.agent.get('/api/reviews/S1');
    const existingId = existing.body.data.review.photos[0].id;

    const original = env.PHOTO_STORAGE_LIMIT_BYTES;
    try {
      // Lower the ceiling below current usage.
      (env as { PHOTO_STORAGE_LIMIT_BYTES: number }).PHOTO_STORAGE_LIMIT_BYTES = 1;

      const upload = await uploadPhoto(r, 'S1', { panelIndex: 2 });
      expect(upload.status).toBe(409);
      expect(upload.body.error.code).toBe('PHOTO_STORAGE_FULL');

      // Everything else MUST still work (FR-061/SC-020).
      const autosave = await r.agent
        .patch('/api/reviews/S1')
        .set('X-CSRF-Token', r.csrf)
        .send(emptyDoc({ overallJudgement: '通過' }));
      expect(autosave.status).toBe(200);

      const view = await r.agent.get(`/api/reviews/S1/photos/${existingId}/file`);
      expect(view.status).toBe(200);

      const submitRes = await submit(r, 'S1', cleanDoc({ overallJudgement: '通過' }));
      expect(submitRes.status).toBe(200);

      const del = await r.agent
        .delete(`/api/reviews/S1/photos/${existingId}`)
        .set('X-CSRF-Token', r.csrf);
      expect(del.status).toBe(200);
    } finally {
      (env as { PHOTO_STORAGE_LIMIT_BYTES: number }).PHOTO_STORAGE_LIMIT_BYTES = original;
    }
  });

  it('rejects an oversize file before it reaches the database', async () => {
    const original = env.PHOTO_MAX_FILE_BYTES;
    try {
      (env as { PHOTO_MAX_FILE_BYTES: number }).PHOTO_MAX_FILE_BYTES = 32;
      const res = await uploadPhoto(r, 'S1', {
        original: Buffer.concat([JPEG_BYTES, Buffer.alloc(1024)]),
        panelIndex: 1,
      });
      expect([400, 413]).toContain(res.status);
      expect(res.body.error.code).toBe('IMAGE_TOO_LARGE');
    } finally {
      (env as { PHOTO_MAX_FILE_BYTES: number }).PHOTO_MAX_FILE_BYTES = original;
    }
  });

  it('admins cannot reach the reviewer photo routes', async () => {
    const { adminAgent } = await import('../../../helpers/http');
    const a = await adminAgent(app);
    const res = await a.agent.get('/api/reviews/S1/photos/anything/file');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
  });
});

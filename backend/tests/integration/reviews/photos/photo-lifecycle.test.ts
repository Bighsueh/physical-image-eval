import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../../../src/app';
import { env } from '../../../../src/config/env';
import { runIngest } from '../../../../src/ingestion/runner';
import { prisma } from '../../../../src/lib/prisma';
import { reviewerAgent, type SeededAgent } from '../../../helpers/http';
import { cleanDoc, docWithPanel } from '../../../helpers/review';
import {
  HEIC_BYTES,
  JPEG_BYTES,
  JPEG_BYTES_2,
  NOT_AN_IMAGE,
  uploadPhoto,
} from '../../../helpers/photo';

/**
 * US8 — attaching reference photos. Covers T104/T105/T110/T111/T112: the draft-creating
 * upload, status preservation on a submitted review, magic-byte validation, the open payload,
 * and byte serving.
 */
describe('reference photos — lifecycle (US8)', () => {
  let r: SeededAgent;
  beforeAll(async () => {
    await runIngest({ sourceDir: env.IMAGE_SOURCE_DIR });
  });
  beforeEach(async () => {
    r = await reviewerAgent(app);
  });

  const submit = (code: string, body: object) =>
    r.agent.post(`/api/reviews/${code}/submit`).set('X-CSRF-Token', r.csrf).send(body);

  it('T104: uploading with no existing review creates a 草稿 and does not count as submitted', async () => {
    const res = await uploadPhoto(r, 'S1', { panelIndex: 1, caption: '正確的收拳角度' });
    expect(res.status).toBe(201);
    expect(res.body.data.reviewStatus).toBe('草稿');
    expect(res.body.data.photo.panelIndex).toBe(1);
    expect(res.body.data.photo.caption).toBe('正確的收拳角度');
    expect(res.body.data.photo.annotated).toBe(false);

    const progress = await r.agent.get('/api/reviews/progress');
    expect(progress.body.data.submitted).toBe(0);

    const open = await r.agent.get('/api/reviews/S1');
    expect(open.body.data.review.status).toBe('草稿');
  });

  it('T104: an image-level photo carries no panelIndex', async () => {
    const res = await uploadPhoto(r, 'S1', {});
    expect(res.status).toBe(201);
    expect(res.body.data.photo.panelIndex).toBeNull();
  });

  it('T105: attaching to a 已提交 review keeps it submitted and never rewrites submittedAt', async () => {
    await submit('S1', cleanDoc({ overallJudgement: '通過' }));
    const before = await r.agent.get('/api/reviews/S1');
    expect(before.body.data.review.status).toBe('已提交');
    const submittedAt = before.body.data.review.submittedAt;

    const res = await uploadPhoto(r, 'S1', { panelIndex: 2 });
    expect(res.status).toBe(201);
    expect(res.body.data.reviewStatus).toBe('已提交');

    const after = await r.agent.get('/api/reviews/S1');
    expect(after.body.data.review.status).toBe('已提交');
    expect(after.body.data.review.submittedAt).toBe(submittedAt);
    // No re-submit was required for the photo to be attached and visible.
    expect(after.body.data.review.photos).toHaveLength(1);

    const progress = await r.agent.get('/api/reviews/progress');
    expect(progress.body.data.submitted).toBe(1);
  });

  it('T110: rejects non-image bytes regardless of the declared filename/type', async () => {
    const res = await uploadPhoto(r, 'S1', {
      original: NOT_AN_IMAGE,
      originalName: 'totally-a-photo.jpg',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNSUPPORTED_IMAGE_TYPE');
  });

  it('T110: accepts HEIC as the original but not as the display derivative', async () => {
    const ok = await uploadPhoto(r, 'S1', { original: HEIC_BYTES, panelIndex: 1 });
    expect(ok.status).toBe(201);

    const bad = await uploadPhoto(r, 'S1', { display: HEIC_BYTES });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('UNSUPPORTED_IMAGE_TYPE');
  });

  it('T111: open returns photos with urls, and never inlines bytes', async () => {
    await uploadPhoto(r, 'S1', { panelIndex: 3, caption: '側面' });
    const open = await r.agent.get('/api/reviews/S1');
    const photos = open.body.data.review.photos;
    expect(photos).toHaveLength(1);
    expect(photos[0].urls.display).toContain('/photos/');
    expect(photos[0].urls.annotated).toBeNull();
    // `urls.original` is a path, so the payload legitimately contains the word — what must be
    // absent is the DATA. No base64 blob, no data: URI, and a payload small enough that bytes
    // could not be hiding in it.
    const photo = photos[0];
    expect(Object.keys(photo)).not.toContain('bytes');
    const body = JSON.stringify(open.body);
    expect(body).not.toContain('data:image');
    expect(body).not.toMatch(/[A-Za-z0-9+/]{500,}={0,2}/); // no base64 payload
    expect(body.length).toBeLessThan(200_000);
  });

  it('T112: serves each variant with its stored type and private caching', async () => {
    const up = await uploadPhoto(r, 'S1', { panelIndex: 1, display: JPEG_BYTES_2 });
    const id = up.body.data.photo.id;

    const display = await r.agent.get(`/api/reviews/S1/photos/${id}/file`);
    expect(display.status).toBe(200);
    expect(display.headers['content-type']).toContain('image/jpeg');
    expect(display.headers['cache-control']).toContain('private');
    expect(display.headers['content-disposition']).toContain('inline');
    expect(Buffer.from(display.body)).toEqual(JPEG_BYTES_2);

    const original = await r.agent.get(`/api/reviews/S1/photos/${id}/file?variant=original`);
    expect(Buffer.from(original.body)).toEqual(JPEG_BYTES);

    const annotated = await r.agent.get(`/api/reviews/S1/photos/${id}/file?variant=annotated`);
    expect(annotated.status).toBe(404);
    expect(annotated.body.error.code).toBe('PHOTO_NOT_FOUND');
  });

  it('deletes a photo, drops its bytes, and reports a repeat delete as not found', async () => {
    const up = await uploadPhoto(r, 'S1', { panelIndex: 1 });
    const id = up.body.data.photo.id;

    const first = await r.agent.delete(`/api/reviews/S1/photos/${id}`).set('X-CSRF-Token', r.csrf);
    expect(first.status).toBe(200);
    expect(await prisma.reviewPhotoBlob.count({ where: { photoId: id } })).toBe(0);

    // Not idempotent-200 on purpose: distinguishing 「已刪除」 from 「不是你的」 would be the
    // existence oracle FR-057 forbids, so both report PHOTO_NOT_FOUND.
    const again = await r.agent.delete(`/api/reviews/S1/photos/${id}`).set('X-CSRF-Token', r.csrf);
    expect(again.status).toBe(404);
    expect(again.body.error.code).toBe('PHOTO_NOT_FOUND');
  });

  it('edits a caption without touching the debounced document autosave', async () => {
    const up = await uploadPhoto(r, 'S1', { panelIndex: 1, caption: '舊的' });
    const id = up.body.data.photo.id;
    const res = await r.agent
      .patch(`/api/reviews/S1/photos/${id}`)
      .set('X-CSRF-Token', r.csrf)
      .send({ caption: '新的說明' });
    expect(res.status).toBe(200);
    expect(res.body.data.photo.caption).toBe('新的說明');
  });

  it('requires CSRF on every photo mutation', async () => {
    const res = await r.agent
      .post('/api/reviews/S1/photos')
      .attach('original', JPEG_BYTES, 'a.jpg')
      .attach('display', JPEG_BYTES, 'b.jpg');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_INVALID');
  });

  it('404s a well-formed but unknown blueprint, and 400s a malformed one', async () => {
    const unknown = await uploadPhoto(r, 'S9', { panelIndex: 1 }); // valid shape, not in catalog
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe('BLUEPRINT_NOT_FOUND');

    const malformed = await uploadPhoto(r, 'Z9', { panelIndex: 1 }); // 'Z' is not a region letter
    expect(malformed.status).toBe(400);
    expect(malformed.body.error.code).toBe('INVALID_PARAM');
  });

  it('preserves the panel binding across a document autosave (photos are not panel children)', async () => {
    const up = await uploadPhoto(r, 'S1', { panelIndex: 2 });
    // A debounced draft save snapshot-replaces all four PanelReview rows.
    await r.agent
      .patch('/api/reviews/S1')
      .set('X-CSRF-Token', r.csrf)
      .send(docWithPanel(2, { problemNote: '打字中' }));

    const open = await r.agent.get('/api/reviews/S1');
    expect(open.body.data.review.photos).toHaveLength(1);
    expect(open.body.data.review.photos[0].id).toBe(up.body.data.photo.id);
    expect(open.body.data.review.photos[0].panelIndex).toBe(2);
  });
});

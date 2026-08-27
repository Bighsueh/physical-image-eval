import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../../../src/app';
import { env } from '../../../../src/config/env';
import { runIngest } from '../../../../src/ingestion/runner';
import { reviewerAgent, type SeededAgent } from '../../../helpers/http';
import { cleanDoc } from '../../../helpers/review';
import { JPEG_BYTES, JPEG_BYTES_2, NOT_AN_IMAGE, PNG_BYTES, uploadPhoto } from '../../../helpers/photo';

/**
 * US9 — in-app annotation (T128–T130). The properties that matter: the original survives
 * untouched, the annotation is re-editable rather than only a picture, and annotating a
 * submitted review never regresses it.
 */
describe('reference photos — annotation (US9)', () => {
  let r: SeededAgent;
  const DESIGN_STATE: Record<string, unknown> = {
    annotations: {
      'arrow-1': { name: 'Arrow', x: 76, y: 17, stroke: '#E0483C', strokeWidth: 6 },
    },
    shownImageDimensions: { width: 4032, height: 3024 },
  };

  beforeAll(async () => {
    await runIngest({ sourceDir: env.IMAGE_SOURCE_DIR });
  });
  beforeEach(async () => {
    r = await reviewerAgent(app);
  });

  const annotate = (
    code: string,
    photoId: string,
    annotated = PNG_BYTES,
    state: Record<string, unknown> = DESIGN_STATE,
  ) =>
    r.agent
      .put(`/api/reviews/${code}/photos/${photoId}/annotation`)
      .set('X-CSRF-Token', r.csrf)
      .attach('annotated', annotated, 'annotated.png')
      .field('annotationState', JSON.stringify(state));

  const attach = async (code = 'S1', panelIndex = 1) => {
    const up = await uploadPhoto(r, code, { panelIndex });
    return up.body.data.photo.id as string;
  };

  it('T128: stores the annotated image and leaves the original byte-identical', async () => {
    const id = await attach();
    const res = await annotate('S1', id);
    expect(res.status).toBe(200);
    expect(res.body.data.photo.annotated).toBe(true);
    expect(res.body.data.photo.urls.annotated).toContain('variant=annotated');

    const original = await r.agent.get(`/api/reviews/S1/photos/${id}/file?variant=original`);
    expect(Buffer.from(original.body)).toEqual(JPEG_BYTES); // FR-052 / SC-012

    const annotated = await r.agent.get(`/api/reviews/S1/photos/${id}/file?variant=annotated`);
    expect(Buffer.from(annotated.body)).toEqual(PNG_BYTES);

    // The display derivative is untouched too — annotation adds a variant, replaces nothing.
    const display = await r.agent.get(`/api/reviews/S1/photos/${id}/file?variant=display`);
    expect(Buffer.from(display.body)).toEqual(JPEG_BYTES);
  });

  it('T128: repeat annotation overwrites — last write wins, no version history', async () => {
    const id = await attach();
    await annotate('S1', id, PNG_BYTES, DESIGN_STATE);
    await annotate('S1', id, JPEG_BYTES_2, { annotations: { 'ellipse-9': { name: 'Ellipse' } } });

    const annotated = await r.agent.get(`/api/reviews/S1/photos/${id}/file?variant=annotated`);
    expect(Buffer.from(annotated.body)).toEqual(JPEG_BYTES_2);

    const state = await r.agent.get(`/api/reviews/S1/photos/${id}/annotation`);
    expect(state.body.data.annotationState).toEqual({
      annotations: { 'ellipse-9': { name: 'Ellipse' } },
    });
  });

  it('T129: the annotation state round-trips exactly, and is absent from the photo listing', async () => {
    const id = await attach();
    await annotate('S1', id);

    const res = await r.agent.get(`/api/reviews/S1/photos/${id}/annotation`);
    expect(res.status).toBe(200);
    expect(res.body.data.annotationState).toEqual(DESIGN_STATE); // SC-019 — re-editable

    // Opening the workspace must NOT carry the state — it is fetched on demand.
    const open = await r.agent.get('/api/reviews/S1');
    expect(JSON.stringify(open.body)).not.toContain('shownImageDimensions');
    expect(open.body.data.review.photos[0].annotated).toBe(true);
  });

  it('T129: an un-annotated photo reports a null state, not an error', async () => {
    const id = await attach();
    const res = await r.agent.get(`/api/reviews/S1/photos/${id}/annotation`);
    expect(res.status).toBe(200);
    expect(res.body.data.annotationState).toBeNull();
  });

  it('T130: annotating a photo on a 已提交 review preserves status and submittedAt', async () => {
    const id = await attach();
    await r.agent.post('/api/reviews/S1/submit').set('X-CSRF-Token', r.csrf).send(
      cleanDoc({ overallJudgement: '通過' }),
    );
    const before = await r.agent.get('/api/reviews/S1');
    const submittedAt = before.body.data.review.submittedAt;

    const res = await annotate('S1', id);
    expect(res.status).toBe(200);

    const after = await r.agent.get('/api/reviews/S1');
    expect(after.body.data.review.status).toBe('已提交');
    expect(after.body.data.review.submittedAt).toBe(submittedAt);
  });

  it('rejects a non-image annotation and malformed state', async () => {
    const id = await attach();
    const badImage = await annotate('S1', id, NOT_AN_IMAGE);
    expect(badImage.status).toBe(400);
    expect(badImage.body.error.code).toBe('UNSUPPORTED_IMAGE_TYPE');

    const badState = await r.agent
      .put(`/api/reviews/S1/photos/${id}/annotation`)
      .set('X-CSRF-Token', r.csrf)
      .attach('annotated', PNG_BYTES, 'a.png')
      .field('annotationState', 'not json{');
    expect(badState.status).toBe(400);
    expect(badState.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('requires CSRF to save an annotation', async () => {
    const id = await attach();
    const res = await r.agent
      .put(`/api/reviews/S1/photos/${id}/annotation`)
      .attach('annotated', PNG_BYTES, 'a.png')
      .field('annotationState', '{}');
    expect(res.status).toBe(403);
  });
});

import { beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../src/app';
import { env } from '../../src/config/env';
import { runIngest } from '../../src/ingestion/runner';
import { reviewerAgent, type SeededAgent } from '../helpers/http';
import { cleanDoc, docWithPanel } from '../helpers/review';
import { PNG_BYTES, uploadPhoto } from '../helpers/photo';
import { captureCorpus } from './capture-review-corpus';

/**
 * T138 / SC-017 — existing review records are untouched by the reference-photo feature.
 *
 * The one-shot "dump before the migration, dump after" check can only be run once, against a
 * database that actually holds reviews (see capture-review-corpus.ts, and the deployment note
 * in quickstart). What CI can prove forever is the stronger day-to-day property: exercising the
 * entire photo feature against a populated corpus changes **nothing** about the reviews that
 * were already there.
 */
describe('existing review data survives the photo feature (SC-017)', () => {
  let subject: SeededAgent;
  let bystander: SeededAgent;

  beforeAll(async () => {
    await runIngest({ sourceDir: env.IMAGE_SOURCE_DIR });
  });

  it('is byte-identical after upload, annotation, caption edit and delete', async () => {
    subject = await reviewerAgent(app);
    bystander = await reviewerAgent(app);

    // A corpus that looks like real work: one submitted, one draft, from two reviewers.
    await subject.agent
      .post('/api/reviews/S1/submit')
      .set('X-CSRF-Token', subject.csrf)
      .send(cleanDoc({ overallJudgement: '需小修', indicationJudgement: '有疑慮', indicationNote: '合併診斷存疑' }));
    await subject.agent
      .patch('/api/reviews/S2')
      .set('X-CSRF-Token', subject.csrf)
      .send(docWithPanel(3, { problemTypes: ['有錯字'], problemNote: '第三格秒數寫錯' }));
    await bystander.agent
      .post('/api/reviews/S1/submit')
      .set('X-CSRF-Token', bystander.csrf)
      .send(cleanDoc({ overallJudgement: '通過' }));

    const before = await captureCorpus();
    expect(before.rowCount).toBe(3);

    // Now exercise the whole photo feature against that corpus.
    const up = await uploadPhoto(subject, 'S1', { panelIndex: 2, caption: '正確角度' });
    expect(up.status).toBe(201);
    const photoId = up.body.data.photo.id;

    await subject.agent
      .put(`/api/reviews/S1/photos/${photoId}/annotation`)
      .set('X-CSRF-Token', subject.csrf)
      .attach('annotated', PNG_BYTES, 'a.png')
      .field('annotationState', JSON.stringify({ annotations: {} }));

    await subject.agent
      .patch(`/api/reviews/S1/photos/${photoId}`)
      .set('X-CSRF-Token', subject.csrf)
      .send({ caption: '改過的說明' });

    await uploadPhoto(subject, 'S2', {}); // image-level photo on the draft
    await uploadPhoto(bystander, 'S1', { panelIndex: 1 });

    await subject.agent
      .delete(`/api/reviews/S1/photos/${photoId}`)
      .set('X-CSRF-Token', subject.csrf);

    const after = await captureCorpus();

    // The whole point: not one judgement, note, panel annotation, status or submit timestamp moved.
    expect(after.rowCount).toBe(before.rowCount);
    expect(after.digest).toBe(before.digest);
    expect(after.rows).toEqual(before.rows);
  });

  it('a photo-created draft adds a review without disturbing the ones already there', async () => {
    // Self-contained: the suite truncates between tests, so this builds its own corpus.
    subject = await reviewerAgent(app);
    await subject.agent
      .post('/api/reviews/S1/submit')
      .set('X-CSRF-Token', subject.csrf)
      .send(cleanDoc({ overallJudgement: '通過' }));

    const before = await captureCorpus();
    expect(before.rowCount).toBe(1);
    // S3 has no review at all yet; attaching a photo creates one as 草稿 (FR-050).
    await uploadPhoto(subject, 'S3', { panelIndex: 1 });
    const after = await captureCorpus();

    expect(after.rowCount).toBe(before.rowCount + 1);
    // Every pre-existing row is still exactly as it was.
    const key = (r: { reviewerId: string; blueprintCode: string }) => `${r.reviewerId}|${r.blueprintCode}`;
    const afterByKey = new Map(after.rows.map((r) => [key(r), r]));
    for (const row of before.rows) expect(afterByKey.get(key(row))).toEqual(row);

    const added = after.rows.find((r) => !before.rows.some((b) => key(b) === key(r)));
    expect(added?.status).toBe('DRAFT');
    expect(added?.overallJudgement).toBeNull();
    expect(added?.panels).toHaveLength(4); // the exactly-four invariant holds from creation
  });
});

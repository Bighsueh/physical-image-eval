import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../../src/app';
import { env } from '../../../src/config/env';
import { runIngest } from '../../../src/ingestion/runner';
import { adminAgent, reviewerAgent, type SeededAgent } from '../../helpers/http';
import { cleanDoc } from '../../helpers/review';

/**
 * 初始化本頁提交記錄 (reset own review) + prev/next neighbours (free browsing). Reset deletes the
 * reviewer's OWN draft or submitted review for a blueprint, back to 未開始; neighbours expose the
 * previous/next blueprint in the catalog's deterministic order.
 */
describe('review reset + navigation neighbours', () => {
  let r: SeededAgent;
  beforeAll(async () => {
    await runIngest({ sourceDir: env.IMAGE_SOURCE_DIR });
  });
  beforeEach(async () => {
    r = await reviewerAgent(app);
  });

  const submit = (code: string, body: object) =>
    r.agent.post(`/api/reviews/${code}/submit`).set('X-CSRF-Token', r.csrf).send(body);
  const reset = (code: string) =>
    r.agent.post(`/api/reviews/${code}/reset`).set('X-CSRF-Token', r.csrf).send();

  it('open exposes prev/next neighbours in catalog order (null at the ends)', async () => {
    // Derive the deterministic order from the progress index (same ordering as neighbours).
    const prog = await r.agent.get('/api/reviews/progress');
    const order = prog.body.data.index.map((i: { blueprintId: string }) => i.blueprintId);
    const first = order[0];
    const second = order[1];
    const last = order[order.length - 1];

    const firstRes = await r.agent.get(`/api/reviews/${first}`);
    expect(firstRes.body.data.neighbors).toEqual({ prev: null, next: second });

    const secondRes = await r.agent.get(`/api/reviews/${second}`);
    expect(secondRes.body.data.neighbors.prev).toBe(first);

    const lastRes = await r.agent.get(`/api/reviews/${last}`);
    expect(lastRes.body.data.neighbors.next).toBeNull();
  });

  it('reset deletes a SUBMITTED review → back to 未開始 and decrements submitted', async () => {
    await submit('S1', cleanDoc({ overallJudgement: '通過' }));
    const before = await r.agent.get('/api/reviews/S1');
    expect(before.body.data.review.status).toBe('已提交');
    expect(before.body.data.progress.submitted).toBe(1);

    const res = await reset('S1');
    expect(res.status).toBe(200);
    expect(res.body.data.review.status).toBe('未開始');
    expect(res.body.data.review.overallJudgement).toBeNull();
    expect(res.body.data.review.panels).toHaveLength(4);
    expect(res.body.data.progress.submitted).toBe(0);

    // Re-open confirms the row is really gone (fresh empty template).
    const after = await r.agent.get('/api/reviews/S1');
    expect(after.body.data.review.status).toBe('未開始');
    expect(after.body.data.progress.submitted).toBe(0);
  });

  it('reset is idempotent on a never-reviewed blueprint (still 200 / 未開始)', async () => {
    const res = await reset('S2');
    expect(res.status).toBe(200);
    expect(res.body.data.review.status).toBe('未開始');
  });

  it('reset errors: 400 bad id, 404 unknown, 403 no CSRF, 403 admin, 401 no session', async () => {
    expect((await reset('zzz')).status).toBe(400);
    expect((await reset('S98')).status).toBe(404);

    const noCsrf = await r.agent.post('/api/reviews/S1/reset').send();
    expect(noCsrf.status).toBe(403);
    expect(noCsrf.body.error.code).toBe('CSRF_INVALID');

    const admin = await adminAgent(app);
    const asAdmin = await admin.agent.post('/api/reviews/S1/reset').set('X-CSRF-Token', admin.csrf).send();
    expect(asAdmin.status).toBe(403);
    expect(asAdmin.body.error.code).toBe('FORBIDDEN_ROLE');

    const anon = await request(app).post('/api/reviews/S1/reset').send();
    expect(anon.status).toBe(401);
  });
});

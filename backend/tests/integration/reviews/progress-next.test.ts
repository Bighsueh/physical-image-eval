import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../../src/app';
import { env } from '../../../src/config/env';
import { runIngest } from '../../../src/ingestion/runner';
import { reviewerAgent, type SeededAgent } from '../../helpers/http';
import { cleanDoc, emptyDoc } from '../../helpers/review';
import { FIXTURE_REGION_COUNTS, FIXTURE_TOTAL_BLUEPRINTS as TOTAL } from '../../fixtures/generate';

describe('progress / next / isolation (US3/US4/US7)', () => {
  let r: SeededAgent;
  beforeAll(async () => {
    await runIngest({ sourceDir: env.IMAGE_SOURCE_DIR });
  });
  beforeEach(async () => {
    r = await reviewerAgent(app);
  });

  const patch = (c: string, b: object) => r.agent.patch(`/api/reviews/${c}`).set('X-CSRF-Token', r.csrf).send(b);
  const submit = (c: string, b: object) => r.agent.post(`/api/reviews/${c}/submit`).set('X-CSRF-Token', r.csrf).send(b);

  it('GET /next returns S1 first, then S2 after S1 is submitted (deterministic order)', async () => {
    expect((await r.agent.get('/api/reviews/next')).body.data).toMatchObject({ next: 'S1', completed: false });
    await submit('S1', cleanDoc({ overallJudgement: '通過' }));
    expect((await r.agent.get('/api/reviews/next')).body.data.next).toBe('S2');
  });

  it('GET /progress: empty reviewer → 0/total; counts + perRegion + filterable index', async () => {
    const empty = await r.agent.get('/api/reviews/progress');
    expect(empty.body.data).toMatchObject({ submitted: 0, draft: 0, notStarted: TOTAL, total: TOTAL });
    expect(empty.body.data.perRegion).toHaveLength(8);
    expect(empty.body.data.perRegion[0]).toMatchObject({ regionCode: 'S', total: FIXTURE_REGION_COUNTS.S });
    expect(empty.body.data.index).toHaveLength(TOTAL);
    expect(empty.body.meta).toMatchObject({ total: TOTAL, submitted: 0 });

    await patch('S1', emptyDoc()); // draft
    await submit('H1', cleanDoc({ overallJudgement: '通過' })); // submitted
    const after = await r.agent.get('/api/reviews/progress');
    expect(after.body.data).toMatchObject({ submitted: 1, draft: 1, notStarted: TOTAL - 2 });

    const draftOnly = await r.agent.get('/api/reviews/progress?status=草稿');
    expect(draftOnly.body.data.index.map((i: { blueprintId: string }) => i.blueprintId)).toEqual(['S1']);
    const kOnly = await r.agent.get('/api/reviews/progress?region=K');
    expect(kOnly.body.data.index.every((i: { regionCode: string }) => i.regionCode === 'K')).toBe(true);
    expect((await r.agent.get('/api/reviews/progress?region=ZZ')).status).toBe(400);
  });

  it('reviewer isolation: B never sees A’s review (SC-010)', async () => {
    const a = await reviewerAgent(app);
    await a.agent
      .patch('/api/reviews/S1')
      .set('X-CSRF-Token', a.csrf)
      .send(emptyDoc({ indicationNote: 'A 的草稿' }));

    const b = await reviewerAgent(app);
    const bOpen = await b.agent.get('/api/reviews/S1');
    expect(bOpen.body.data.review.status).toBe('未開始'); // empty template, not A's draft
    expect(bOpen.body.data.review.indicationNote).toBeNull();
    expect((await b.agent.get('/api/reviews/progress')).body.data.submitted).toBe(0);
  });

  it('submitting every blueprint → /next completed, progress total/total (SC-008)', async () => {
    const index: Array<{ blueprintId: string }> = (await r.agent.get('/api/reviews/progress')).body.data.index;
    expect(index).toHaveLength(TOTAL);
    for (const { blueprintId } of index) {
      const res = await submit(blueprintId, cleanDoc({ overallJudgement: '通過' }));
      expect(res.status).toBe(200);
    }
    const next = await r.agent.get('/api/reviews/next');
    expect(next.body.data).toMatchObject({ next: null, completed: true, submitted: TOTAL, total: TOTAL });
    expect((await r.agent.get('/api/reviews/progress')).body.data.submitted).toBe(TOTAL);
  });
});

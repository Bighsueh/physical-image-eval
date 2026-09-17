import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../../src/app';
import { env } from '../../../src/config/env';
import { runIngest } from '../../../src/ingestion/runner';
import { adminAgent, reviewerAgent, type SeededAgent } from '../../helpers/http';
import { cleanDoc, docWithPanel, emptyDoc } from '../../helpers/review';
import { FIXTURE_TOTAL_BLUEPRINTS } from '../../fixtures/generate';

/** US1–US5 review workflow over the ingested catalog. Reviewer auth is recreated per test; the
 * catalog persists (reviews are cascade-cleared with Account each test). */
describe('review workflow (US1–US5)', () => {
  let r: SeededAgent;
  beforeAll(async () => {
    await runIngest({ sourceDir: env.IMAGE_SOURCE_DIR }); // populate catalog (S1..S4, H1.., high-risk S4…)
  });
  beforeEach(async () => {
    r = await reviewerAgent(app);
  });

  const patch = (code: string, body: object) =>
    r.agent.patch(`/api/reviews/${code}`).set('X-CSRF-Token', r.csrf).send(body);
  const submit = (code: string, body: object) =>
    r.agent.post(`/api/reviews/${code}/submit`).set('X-CSRF-Token', r.csrf).send(body);

  it('US1: open returns blueprint + empty template + progress; NO aiPrompt', async () => {
    const res = await r.agent.get('/api/reviews/S1');
    expect(res.status).toBe(200);
    expect(res.body.data.blueprint.blueprintId).toBe('S1');
    expect(res.body.data.blueprint.panels).toHaveLength(4);
    expect(res.body.data.blueprint.panels[0].visualDescription).toBeDefined();
    expect(res.body.data.blueprint.aiPrompt).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('prompt for');
    expect(res.body.data.review.status).toBe('未開始');
    expect(res.body.data.review.panels).toHaveLength(4);
    expect(res.body.data.progress).toEqual({ submitted: 0, total: FIXTURE_TOTAL_BLUEPRINTS });
  });

  it('US1: open errors — 400 bad id, 404 unknown, 401 no session, 403 admin', async () => {
    expect((await r.agent.get('/api/reviews/zzz')).status).toBe(400);
    expect((await r.agent.get('/api/reviews/S98')).status).toBe(404);
    expect((await request(app).get('/api/reviews/S1')).status).toBe(401);
    const a = await adminAgent(app);
    const res = await a.agent.get('/api/reviews/S1');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
  });

  it('US2: clean image — 通過 + all panels 無問題 submits + auto-advance', async () => {
    const res = await submit('S1', cleanDoc({ overallJudgement: '通過' }));
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('已提交');
    expect(res.body.data.next).toBe('S2'); // deterministic next unreviewed
    expect(res.body.data.progress.submitted).toBe(1);
    expect(res.body.error).toBeNull();
  });

  it('submit gate: a panel that is neither 無問題 nor annotated → 400 PANEL_REVIEW_INCOMPLETE', async () => {
    // 整體判定 set, but panels left empty + not signed off → blocked, nothing submitted.
    const res = await submit('S1', emptyDoc({ overallJudgement: '通過' }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('PANEL_REVIEW_INCOMPLETE');
    expect((await r.agent.get('/api/reviews/S1')).body.data.progress.submitted).toBe(0);
    // A panel annotated with a problem (no 無問題) satisfies the gate.
    const ok = await submit(
      'S1',
      cleanDoc({ overallJudgement: '需小修', otherComment: '整體偏好補充說明' }),
    );
    expect(ok.status).toBe(200);
    const open = await r.agent.get('/api/reviews/S1');
    expect(open.body.data.review.otherComment).toBe('整體偏好補充說明'); // 其他意見 persisted
    expect(open.body.data.review.panels.every((p: { noProblem: boolean }) => p.noProblem)).toBe(true);
  });

  it('US3: autosave creates 草稿, preserves orphan free-text, restores 100% on reopen', async () => {
    const doc = docWithPanel(
      2,
      { problemNote: '第2格秒數疑似錯誤', warningOther: '孤兒文字（未勾選）' }, // orphan: no problemTypes/warnings selected
      { indicationJudgement: '有疑慮' },
    );
    const save = await patch('S3', doc);
    expect(save.status).toBe(200);
    expect(save.body.data.status).toBe('草稿');

    const reopened = await r.agent.get('/api/reviews/S3');
    expect(reopened.body.data.review.status).toBe('草稿');
    expect(reopened.body.data.review.indicationJudgement).toBe('有疑慮');
    expect(reopened.body.data.review.panels[1].problemNote).toBe('第2格秒數疑似錯誤');
    expect(reopened.body.data.review.panels[1].warningOther).toBe('孤兒文字（未勾選）'); // orphan preserved
    expect(reopened.body.data.progress.submitted).toBe(0); // draft not counted
  });

  it('US3: autosave never regresses 已提交 → 草稿 and never double-counts', async () => {
    await submit('S1', cleanDoc({ overallJudgement: '通過' }));
    const afterPatch = await patch('S1', emptyDoc({ overallJudgement: '通過', indicationNote: '補充' }));
    expect(afterPatch.body.data.status).toBe('已提交'); // stays submitted
    const open = await r.agent.get('/api/reviews/S1');
    expect(open.body.data.progress.submitted).toBe(1); // not double-counted
  });

  it('US4: submit without 整體判定 → 400 OVERALL_JUDGEMENT_REQUIRED, nothing submitted', async () => {
    const res = await submit('S1', emptyDoc({ overallJudgement: null }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('OVERALL_JUDGEMENT_REQUIRED');
    expect(res.body.error.message).toBe('請先選擇整體判定');
    expect((await r.agent.get('/api/reviews/S1')).body.data.progress.submitted).toBe(0);
  });

  it('US5: re-submit overwrites in place — submittedAt unchanged, lastUpdated newer, one row', async () => {
    const first = await submit('S1', cleanDoc({ overallJudgement: '通過' }));
    const submittedAt = first.body.data.submittedAt;
    await new Promise((res) => setTimeout(res, 10));
    const second = await submit('S1', cleanDoc({ overallJudgement: '需小修' }));
    expect(second.body.data.submittedAt).toBe(submittedAt); // first-submit time kept
    expect(new Date(second.body.data.lastUpdatedAt).getTime()).toBeGreaterThan(
      new Date(submittedAt).getTime(),
    );
    expect(second.body.data.progress.submitted).toBe(1); // still one
    const open = await r.agent.get('/api/reviews/S1');
    expect(open.body.data.review.overallJudgement).toBe('需小修'); // overwritten
  });

  it('US6: isHighRisk true for S4, false for S1', async () => {
    expect((await r.agent.get('/api/reviews/S4')).body.data.blueprint.isHighRisk).toBe(true);
    expect((await r.agent.get('/api/reviews/S1')).body.data.blueprint.isHighRisk).toBe(false);
  });

  it('enum values round-trip as verbatim zh-TW; free text is returned verbatim (no double-encoding)', async () => {
    // Free text is stored AND returned verbatim — the React SPA binds it into controlled inputs
    // (XSS-safe); escaping it server-side would corrupt clinical notes containing < > & on reload.
    await patch('S2', docWithPanel(1, { requiredWarnings: ['注意跌倒'], problemTypes: ['有錯字'], problemNote: '伸直角度需 <30°' }, { overallJudgement: '需重做' }));
    const open = await r.agent.get('/api/reviews/S2');
    expect(open.body.data.review.overallJudgement).toBe('需重做');
    expect(open.body.data.review.panels[0].requiredWarnings).toEqual(['注意跌倒']);
    expect(open.body.data.review.panels[0].problemTypes).toEqual(['有錯字']);
    expect(open.body.data.review.panels[0].problemNote).toBe('伸直角度需 <30°'); // verbatim, not escaped
  });

  it('CSRF is required on autosave and submit', async () => {
    expect((await r.agent.patch('/api/reviews/S1').send(emptyDoc())).status).toBe(403);
    expect((await r.agent.post('/api/reviews/S1/submit').send(emptyDoc({ overallJudgement: '通過' }))).status).toBe(403);
  });
});

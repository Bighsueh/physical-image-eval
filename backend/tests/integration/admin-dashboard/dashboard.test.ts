import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../../src/app';
import { env } from '../../../src/config/env';
import { runIngest } from '../../../src/ingestion/runner';
import { adminAgent, reviewerAgent } from '../../helpers/http';
import { seedDashboard } from '../../helpers/dashboard-seed';
import { FIXTURE_TOTAL_BLUEPRINTS } from '../../fixtures/generate';

interface ImageRow {
  blueprintId: string;
  submittedActiveCount: number;
  distribution: Record<string, number>;
  hasRedo: boolean;
  inactiveSubmittedCount: number;
  isHighRisk: boolean;
  fullCoverage: boolean;
  missingReviewers: { displayName: string }[];
}

describe('admin dashboard (US1)', () => {
  let admin: Awaited<ReturnType<typeof adminAgent>>;
  beforeAll(async () => {
    await runIngest({ sourceDir: env.IMAGE_SOURCE_DIR });
  });
  beforeEach(async () => {
    await seedDashboard();
    admin = await adminAgent(app);
  });

  it('overview: active-basis completion + 非在職 separate', async () => {
    const res = await admin.agent.get('/api/admin/dashboard/overview');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      activeReviewerCount: 3,
      expectedSubmissions: 3 * FIXTURE_TOTAL_BLUEPRINTS,
      submittedActive: 3,
      inactiveSubmittedTotal: 1,
      highRiskCount: 9,
      totalBlueprints: FIXTURE_TOTAL_BLUEPRINTS,
    });
    expect(res.body.data.percent).toBeCloseTo((3 / (3 * FIXTURE_TOTAL_BLUEPRINTS)) * 100, 1); // never > 100
    expect(res.body.data.blueprintsWithRedoCount).toBeGreaterThanOrEqual(1);
  });

  it('reviewers: per-reviewer progress, ordering, empty reviewer, 非在職 flagged', async () => {
    const res = await admin.agent.get('/api/admin/dashboard/reviewers');
    expect(res.body.meta).toMatchObject({ total: 4, activeCount: 3, inactiveCount: 1 });
    const byName = Object.fromEntries(res.body.data.map((r: { displayName: string }) => [r.displayName, r]));
    expect(byName['甲醫師'].submittedCount).toBe(2);
    expect(byName['丙醫師'].submittedCount).toBe(0);
    expect(byName['丙醫師'].unreviewedBlueprintIds).toHaveLength(FIXTURE_TOTAL_BLUEPRINTS);
    expect(byName['丙醫師'].lastSubmittedBlueprintId).toBeNull();
    expect(byName['前醫師'].isActive).toBe(false);
    // active reviewers come before 非在職
    expect(res.body.data[res.body.data.length - 1].displayName).toBe('前醫師');
  });

  it('images: coverage + distribution (active only) + 非在職 separate + filters', async () => {
    const res = await admin.agent.get('/api/admin/dashboard/images');
    expect(res.body.meta.total).toBe(FIXTURE_TOTAL_BLUEPRINTS);
    const s1: ImageRow = res.body.data.find((i: ImageRow) => i.blueprintId === 'S1');
    expect(s1.submittedActiveCount).toBe(2);
    expect(s1.distribution).toEqual({ 通過: 1, 需小修: 0, 需重做: 1 });
    expect(s1.hasRedo).toBe(true);
    expect(s1.inactiveSubmittedCount).toBe(1);
    expect(s1.fullCoverage).toBe(false);
    expect(s1.missingReviewers.map((m) => m.displayName)).toContain('丙醫師');

    const redo = await admin.agent.get('/api/admin/dashboard/images?hasRedo=true');
    expect(redo.body.data.every((i: ImageRow) => i.hasRedo)).toBe(true);
    expect(redo.body.data.some((i: ImageRow) => i.blueprintId === 'S1')).toBe(true);

    const hr = await admin.agent.get('/api/admin/dashboard/images?highRisk=true');
    expect(hr.body.data.every((i: ImageRow) => i.isHighRisk)).toBe(true);
    expect(hr.body.data.some((i: ImageRow) => i.blueprintId === 'S1')).toBe(false); // S1 not high-risk

    expect((await admin.agent.get('/api/admin/dashboard/images?hasRedo=maybe')).status).toBe(400);
  });

  it('drilldown: all submitters incl 非在職, disagreement, 404/400', async () => {
    const res = await admin.agent.get('/api/admin/dashboard/images/S1');
    expect(res.body.data.rows).toHaveLength(3); // R1 + R2 + R4(非在職)
    expect(res.body.data.hasDisagreement).toBe(true); // 通過 vs 需重做
    expect(res.body.data.rows.some((r: { isActive: boolean }) => r.isActive === false)).toBe(true);

    expect((await admin.agent.get('/api/admin/dashboard/images/zzz')).status).toBe(400);
    expect((await admin.agent.get('/api/admin/dashboard/images/S99')).status).toBe(404);
  });

  it('access control: reviewer → 403, no session → 401, on every route', async () => {
    const reviewer = await reviewerAgent(app);
    for (const path of [
      '/api/admin/dashboard/overview',
      '/api/admin/dashboard/reviewers',
      '/api/admin/dashboard/images',
      '/api/admin/dashboard/images/S1',
      '/api/admin/export/reviews.csv',
    ]) {
      expect((await reviewer.agent.get(path)).status).toBe(403);
      expect((await request(app).get(path)).status).toBe(401);
    }
  });
});

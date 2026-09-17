import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../../src/app';
import { env } from '../../../src/config/env';
import { runIngest } from '../../../src/ingestion/runner';
import { reviewerAgent, type SeededAgent } from '../../helpers/http';
import { HIGH_RISK_BLUEPRINT_IDS } from '../../../src/catalog/constants/catalog-constants';
import {
  FIXTURE_MAPPED_DIAGNOSES,
  FIXTURE_REFERRAL_DIAGNOSES,
  FIXTURE_REGION_COUNTS,
  FIXTURE_TOTAL_BLUEPRINTS,
  FIXTURE_TOTAL_DIAGNOSES,
} from '../../fixtures/generate';

/** US1 — the GET-only catalog read API over the ingested catalog (contract §1–4). */
describe('catalog read API (US1)', () => {
  let r: SeededAgent;
  beforeAll(async () => {
    await runIngest({ sourceDir: env.IMAGE_SOURCE_DIR });
  });
  beforeEach(async () => {
    r = await reviewerAgent(app); // catalog persists; auth recreated per test
  });

  it('GET /api/regions → 8 regions ordered with blueprintCount', async () => {
    const res = await r.agent.get('/api/regions');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(8);
    expect(res.body.data.map((x: { regionCode: string }) => x.regionCode)).toEqual([
      'S', 'H', 'E', 'T', 'P', 'K', 'L', 'Y',
    ]);
    expect(res.body.data[0]).toMatchObject({ regionCode: 'S', nameZh: '肩部', blueprintCount: FIXTURE_REGION_COUNTS.S });
    expect(res.body.meta.total).toBe(8);
  });

  it('GET /api/blueprints → whole catalog, with region + highRisk filters and param validation', async () => {
    expect((await r.agent.get('/api/blueprints')).body.data).toHaveLength(FIXTURE_TOTAL_BLUEPRINTS);
    expect((await r.agent.get('/api/blueprints?region=S')).body.data).toHaveLength(FIXTURE_REGION_COUNTS.S);
    expect((await r.agent.get('/api/blueprints?highRisk=true')).body.data).toHaveLength(HIGH_RISK_BLUEPRINT_IDS.size);
    expect((await r.agent.get('/api/blueprints?region=ZZ')).status).toBe(400);
  });

  it('GET /api/blueprints/:id → detail with 4 ordered panels and NO aiPrompt', async () => {
    const res = await r.agent.get('/api/blueprints/S1');
    expect(res.status).toBe(200);
    expect(res.body.data.panels).toHaveLength(4);
    expect(res.body.data.panels.map((p: { panelIndex: number }) => p.panelIndex)).toEqual([1, 2, 3, 4]);
    expect(res.body.data.imageUrl).toBe('/api/blueprints/S1/image');
    expect(res.body.data.aiPrompt).toBeUndefined();
    expect(res.body.data).not.toHaveProperty('contentHash');
    expect(JSON.stringify(res.body)).not.toContain('prompt for'); // aiPrompt content never leaks
  });

  it('GET /api/blueprints/:id → 404 for valid-shape-missing, 400 for malformed', async () => {
    expect((await r.agent.get('/api/blueprints/S98')).status).toBe(404);
    expect((await r.agent.get('/api/blueprints/zzz')).status).toBe(400);
  });

  it('GET /api/diagnoses → every diagnosis with reconciliation meta + filters', async () => {
    const res = await r.agent.get('/api/diagnoses');
    expect(res.body.data).toHaveLength(FIXTURE_TOTAL_DIAGNOSES);
    expect(res.body.meta).toMatchObject({ total: FIXTURE_TOTAL_DIAGNOSES, referral: FIXTURE_REFERRAL_DIAGNOSES });
    expect(res.body.meta.mapped + res.body.meta.template).toBe(FIXTURE_MAPPED_DIAGNOSES);
    expect((await r.agent.get('/api/diagnoses?mappingKind=REFERRAL')).body.data).toHaveLength(
      FIXTURE_REFERRAL_DIAGNOSES,
    );
  });

  it('rejects an unauthenticated request with 401', async () => {
    const res = await request(app).get('/api/regions');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_REQUIRED');
  });
});

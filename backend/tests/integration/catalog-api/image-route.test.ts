import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../../src/app';
import { env } from '../../../src/config/env';
import { runIngest } from '../../../src/ingestion/runner';
import { reviewerAgent, type SeededAgent } from '../../helpers/http';

/** US1 — the read-only blueprint image route (contract §5, D5). */
describe('image route (US1)', () => {
  let r: SeededAgent;
  beforeAll(async () => {
    await runIngest({ sourceDir: env.IMAGE_SOURCE_DIR });
  });
  beforeEach(async () => {
    r = await reviewerAgent(app);
  });

  it('streams image/png for a valid blueprint', async () => {
    const res = await r.agent.get('/api/blueprints/S1/image');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
  });

  it('400 INVALID_PARAM for a malformed id', async () => {
    const res = await r.agent.get('/api/blueprints/zzz/image');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_PARAM');
  });

  it('404 BLUEPRINT_NOT_FOUND for a valid-shape-missing id', async () => {
    const res = await r.agent.get('/api/blueprints/S97/image');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('BLUEPRINT_NOT_FOUND');
  });

  it('401 without a session', async () => {
    const res = await request(app).get('/api/blueprints/S1/image');
    expect(res.status).toBe(401);
  });
});

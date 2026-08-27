import { expect, request as pwRequest, test, type Page } from '@playwright/test';
import {
  ADMIN_NEW_PASS,
  API_URL,
  BOOTSTRAP_USER,
  adminContext,
  csrfOf,
  seedActiveReviewer,
  type SeededReviewer,
} from './api';

/**
 * Feature 004 E2E (constitution VII). Admin dashboard overview → drill-down → CSV download; reviewer
 * blocked. Live stack; catalog ingested by global-setup. A reviewer is seeded and submits one review
 * via the real API so the dashboard has data.
 */
let reviewer: SeededReviewer;

/**
 * A clean-image submission. Every panel must be explicitly signed off — since the 2026-07-01
 * per-panel gate, a document with four blank panels is rejected with PANEL_REVIEW_INCOMPLETE,
 * so the earlier all-blank version of this helper silently produced zero submitted reviews.
 */
const cleanDoc = (overall: string) => ({
  overallJudgement: overall,
  indicationJudgement: null,
  indicationNote: null,
  panels: [1, 2, 3, 4].map((panelIndex) => ({
    panelIndex,
    noProblem: true,
    requiredWarnings: [],
    warningOther: null,
    problemTypes: [],
    problemNote: null,
  })),
});

test.beforeAll(async () => {
  const admin = await adminContext();
  reviewer = await seedActiveReviewer(admin, `e2e_dash_${Date.now()}`, '甲醫師');
  await admin.dispose();

  // The reviewer submits S1 via the real API so the dashboard shows a coverage row.
  const ctx = await pwRequest.newContext({ baseURL: API_URL });
  await ctx.post('/api/auth/login', { data: { username: reviewer.username, password: reviewer.password } });
  const csrf = await csrfOf(ctx);
  await ctx.post('/api/reviews/S1/submit', { data: cleanDoc('通過'), headers: { 'X-CSRF-Token': csrf } });
  await ctx.dispose();
});

async function loginUI(page: Page, username: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('帳號').fill(username);
  await page.getByLabel('密碼').fill(password);
  await page.getByRole('button', { name: '登入' }).click();
}

test('admin sees overview, image coverage, and drills into a blueprint', async ({ page }) => {
  await loginUI(page, BOOTSTRAP_USER, ADMIN_NEW_PASS);
  await page.waitForURL('**/admin/accounts');
  await page.goto('/admin/dashboard');
  await expect(page.getByRole('heading', { name: '整體進度' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '各圖覆蓋與判定' })).toBeVisible();
  await expect(page.getByText('五十肩鐘擺與爬牆運動')).toBeVisible();

  await page.getByRole('link', { name: /逐位明細/ }).first().click();
  await page.waitForURL('**/admin/dashboard/images/**');
  await expect(page.getByText('甲醫師')).toBeVisible(); // the submitter appears in the drill-down
});

test('admin can export the CSV (button present + endpoint serves text/csv with the header)', async ({ page }) => {
  await loginUI(page, BOOTSTRAP_USER, ADMIN_NEW_PASS);
  await page.waitForURL('**/admin/accounts'); // let the login redirect land before navigating
  await page.goto('/admin/dashboard');
  await expect(page.getByRole('button', { name: /匯出 CSV/ })).toBeEnabled();

  // Verify the actual export end-to-end via the admin API (robust vs. blob-download event capture).
  const admin = await adminContext();
  const res = await admin.get('/api/admin/export/reviews.csv');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('text/csv');
  expect(await res.text()).toContain('審查者ID'); // fixed zh-TW header row
  await admin.dispose();
});

test('a reviewer is blocked from the admin dashboard (UI redirect + API 403)', async ({ page }) => {
  await loginUI(page, reviewer.username, reviewer.password);
  await page.waitForURL('**/progress');
  await page.goto('/admin/dashboard');
  await expect(page).not.toHaveURL(/\/admin\/dashboard$/); // ADMIN guard redirects the reviewer away

  const ctx = await pwRequest.newContext({ baseURL: API_URL });
  await ctx.post('/api/auth/login', { data: { username: reviewer.username, password: reviewer.password } });
  const res = await ctx.get('/api/admin/dashboard/overview');
  expect(res.status()).toBe(403);
  await ctx.dispose();
});

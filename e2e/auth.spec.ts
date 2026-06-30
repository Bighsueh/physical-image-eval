import { expect, request as pwRequest, test } from '@playwright/test';
import {
  adminContext,
  ADMIN_NEW_PASS,
  API_URL,
  BOOTSTRAP_USER,
  seedActiveReviewer,
  type SeededReviewer,
} from './api';

/** Log in through the UI and wait for the post-login landing. */
async function uiLogin(page: import('@playwright/test').Page, username: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('帳號').fill(username);
  await page.getByLabel('密碼').fill(password);
  await page.getByRole('button', { name: '登入' }).click();
}

/**
 * Feature 001 E2E (constitution VII — critical flows). Runs against the live stack (frontend :5180
 * proxying /api → backend :3100). Accounts are seeded through the real API. Executed in the
 * consolidated validation run (Phase 8). Blocks are added per user story.
 */

let reviewer: SeededReviewer;

test.beforeAll(async () => {
  const admin = await adminContext();
  reviewer = await seedActiveReviewer(admin, `e2e_reviewer_${Date.now()}`, '林醫師');
  await admin.dispose();
});

test.describe('US1 — reviewer login → 0/51 landing', () => {
  test('valid reviewer login lands on /progress showing 0／51', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('帳號').fill(reviewer.username);
    await page.getByLabel('密碼').fill(reviewer.password);
    await page.getByRole('button', { name: '登入' }).click();

    await expect(page).toHaveURL(/\/progress$/);
    await expect(page.getByText('51')).toBeVisible();
    await expect(page.getByText('我的審查進度')).toBeVisible();
  });

  test('wrong credentials show the generic failure and stay on login', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('帳號').fill(reviewer.username);
    await page.getByLabel('密碼').fill('definitely-wrong');
    await page.getByRole('button', { name: '登入' }).click();

    await expect(page.getByRole('alert')).toContainText('帳號或密碼錯誤');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('the login screen has no registration entry (US3)', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByText(/註冊|建立帳號|申請帳號/)).toHaveCount(0);
    await expect(page.locator('a')).toHaveCount(0);
  });

  test('probing /api/auth/register returns 404, never a form (US3)', async ({ request }) => {
    const res = await request.post(`${API_URL}/api/auth/register`, { data: {} });
    expect(res.status()).toBe(404);
  });
});

test.describe('US3 — zero registration surface', () => {
  test('an unauthenticated visit to a protected route redirects to /login', async ({ page }) => {
    await page.goto('/admin/accounts');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('button', { name: '登入' })).toBeVisible();
  });

  test('common registration paths all 404 (never a form)', async ({ request }) => {
    for (const path of ['/api/auth/register', '/api/signup', '/api/accounts', '/api/auth/request-account']) {
      const res = await request.post(`${API_URL}${path}`, { data: {} });
      expect(res.status()).toBe(404);
    }
  });
});

test.describe('US5 — session restore + logout', () => {
  test('a session is restored after reopening (no re-login), and logout forces re-login', async ({
    page,
  }) => {
    await uiLogin(page, reviewer.username, reviewer.password);
    await expect(page).toHaveURL(/\/progress$/);

    // reopen the tool (reload) → session restored without re-entering credentials (FR-016)
    await page.reload();
    await expect(page).toHaveURL(/\/progress$/);
    await expect(page.getByText('我的審查進度')).toBeVisible();

    // logout → back to login; protected route now requires re-login (FR-018)
    await page.getByRole('button', { name: '登出' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto('/progress');
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe('US4 — server-enforced role separation', () => {
  test('a reviewer is blocked from admin routes at the SERVER, even with no admin UI', async () => {
    const admin = await adminContext();
    const blocked = await seedActiveReviewer(admin, `e2e_role_${Date.now()}`, '受限審查員');
    await admin.dispose();

    // log the reviewer in via the API and try to hit an admin route directly
    const ctx = await pwRequest.newContext();
    await ctx.post(`${API_URL}/api/auth/login`, {
      data: { username: blocked.username, password: blocked.password },
    });
    const res = await ctx.get(`${API_URL}/api/admin/accounts`);
    expect(res.status()).toBe(403);
    expect((await res.json()).error.code).toBe('FORBIDDEN_ROLE');
    await ctx.dispose();
  });
});

test.describe('US2 — admin account lifecycle', () => {
  test('admin creates a reviewer and sees the one-time temp password', async ({ page }) => {
    await adminContext(); // ensures bootstrap admin password is rotated to ADMIN_NEW_PASS
    await uiLogin(page, BOOTSTRAP_USER, ADMIN_NEW_PASS);
    await expect(page).toHaveURL(/\/admin\/accounts$/);

    await page.goto('/admin/accounts/new');
    const username = `e2e_made_${Date.now()}`;
    await page.getByLabel('顯示名稱').fill('新審查員');
    await page.getByLabel('帳號識別碼').fill(username);
    await page.getByRole('button', { name: '建立帳號' }).click();

    // one-time temp password surfaced for hand-off
    await expect(page.getByText('一次性臨時密碼')).toBeVisible();
  });

  test('disabling a reviewer blocks subsequent login', async ({ page }) => {
    const admin = await adminContext();
    const reviewer = await seedActiveReviewer(admin, `e2e_disable_${Date.now()}`, '待停用');

    // disable via the API (admin already authenticated)
    const list = await admin.get(`${API_URL}/api/admin/accounts?q=${reviewer.username}`);
    const id = (await list.json()).data[0].id;
    const csrf = (await admin.storageState()).cookies.find((c) => c.name === 'pie_csrf')?.value ?? '';
    await admin.post(`${API_URL}/api/admin/accounts/${id}/disable`, { headers: { 'X-CSRF-Token': csrf } });
    await admin.dispose();

    // disabled reviewer can no longer log in (generic failure)
    await uiLogin(page, reviewer.username, reviewer.password);
    await expect(page.getByRole('alert')).toContainText('帳號或密碼錯誤');
    await expect(page).toHaveURL(/\/login$/);
  });
});

import { expect, test } from '@playwright/test';
import { adminContext, API_URL, seedActiveReviewer, type SeededReviewer } from './api';

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

import { expect, test, type Page } from '@playwright/test';
import { adminContext, seedActiveReviewer, type SeededReviewer } from './api';

/**
 * Feature 003 E2E (constitution VII). Live stack (frontend :5180 → backend :3100), real catalog
 * ingested by global-setup. Covers the headline reviewer flows: open (US1), clean keyboard-ish
 * submit + auto-advance (US2), autosave + restore (US3), high-risk caution (US6).
 */
let reviewer: SeededReviewer;

test.beforeAll(async () => {
  const admin = await adminContext();
  reviewer = await seedActiveReviewer(admin, `e2e_rev_${Date.now()}`, '林醫師');
  await admin.dispose();
});

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('帳號').fill(reviewer.username);
  await page.getByLabel('密碼').fill(reviewer.password);
  await page.getByRole('button', { name: '登入' }).click();
  await page.waitForURL('**/progress');
}

test('US1: opens a blueprint in Layout A with image + metadata + form, no aiPrompt', async ({ page }) => {
  await login(page);
  await page.goto('/review/S1');
  await expect(page.getByRole('heading', { name: /S1・/ })).toBeVisible();
  await expect(page.getByRole('img', { name: /S1/ })).toBeVisible();
  await expect(page.getByRole('radio', { name: /通過/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: '圖 1', level: 4 })).toBeVisible(); // panel form
  await expect(page.locator('body')).not.toContainText('aiPrompt');
});

test('US2: 通過 + submit auto-advances to the next unreviewed blueprint', async ({ page }) => {
  await login(page);
  await page.goto('/review/S1');
  await page.getByRole('radio', { name: /通過/ }).click();
  await page.getByRole('button', { name: /提交並前往下一張/ }).click();
  await page.waitForURL('**/review/S2'); // deterministic auto-advance
  await expect(page.getByRole('heading', { name: /S2・/ })).toBeVisible();
});

test('US3: a draft note autosaves and is fully restored after reload (still 草稿)', async ({ page }) => {
  await login(page);
  await page.goto('/review/S3');
  const note = page.getByLabel('問題說明（選填）').first();
  await note.fill('第1格秒數疑似錯誤');
  await expect(page.getByText('草稿已儲存')).toBeVisible(); // autosave landed
  await page.reload();
  await expect(page.getByLabel('問題說明（選填）').first()).toHaveValue('第1格秒數疑似錯誤');
});

test('US6: high-risk blueprint shows an icon+text caution; non-high-risk does not', async ({ page }) => {
  await login(page);
  await page.goto('/review/S4'); // high-risk
  await expect(page.getByText('高風險').first()).toBeVisible();
  await expect(page.getByText(/確認安全與禁忌/)).toBeVisible();
  await page.goto('/review/S1'); // not high-risk
  await expect(page.getByText('高風險')).toHaveCount(0);
});

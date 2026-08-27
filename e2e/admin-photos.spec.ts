import { expect, test, type Page } from '@playwright/test';
import { ADMIN_NEW_PASS, BOOTSTRAP_USER, adminContext, seedActiveReviewer, type SeededReviewer } from './api';

/**
 * 004 US5 E2E — the admin's repair workbench.
 *
 * The property this exists to prove is the one that cannot be checked from either side alone:
 * a photo a reviewer attached but never submitted is invisible here, while a submitted one is
 * present, downloadable, and named so its owner is obvious.
 */
let submitter: SeededReviewer;
let drafter: SeededReviewer;
/** The bootstrap admin, after api.ts has rotated its forced first-login password. */
const adminCreds = { username: BOOTSTRAP_USER, password: ADMIN_NEW_PASS };

/**
 * A REAL 8×8 JPEG. The browser genuinely decodes the file (that is how the display derivative
 * gets made), so a hand-rolled header with filler bytes — which passes the server's magic-byte
 * check — fails in an actual page. E2E needs a decodable image.
 */
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAIAAgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDQooor58+wP//Z',
  'base64',
);

test.beforeAll(async () => {
  const admin = await adminContext();
  const stamp = Date.now();
  submitter = await seedActiveReviewer(admin, `e2e_sub_${stamp}`, '提交醫師');
  drafter = await seedActiveReviewer(admin, `e2e_draft_${stamp}`, '草稿醫師');
  await admin.dispose();
});

async function loginAs(page: Page, username: string, password: string, expectUrl: string) {
  await page.goto('/login');
  await dismissTour(page);
  await page.getByLabel('帳號').fill(username);
  await page.getByLabel('密碼').fill(password);
  await page.getByRole('button', { name: '登入' }).click();
  await page.waitForURL(expectUrl);
}

/**
 * The first-visit onboarding tour paints a full-page overlay that swallows clicks. Marking it
 * seen is how the app itself remembers, so this is the same state a returning reviewer has —
 * not a test-only bypass.
 */
async function dismissTour(page: Page) {
  await page.evaluate((k) => window.localStorage.setItem(k, '1'), 'pie_review_tour_seen_v1');
}

async function attachPhoto(page: Page) {
  // Scope to the active panel's form: the page also carries an image-level upload field, and
  // `.first()` would silently attach to whichever happens to come first in the DOM.
  await page
    .locator('#review-active-panel input[type=file]')
    .setInputFiles({ name: 'ref.jpg', mimeType: 'image/jpeg', buffer: JPEG });
  await expect(page.getByText(/已上傳 [1-9]/).first()).toBeVisible({ timeout: 15_000 });
}

test('US5: the work table shows submitted photos and hides draft ones', async ({ page }) => {
  // One reviewer attaches and SUBMITS.
  await loginAs(page, submitter.username, submitter.password, '**/progress');
  await page.goto('/review/E5');
  await attachPhoto(page);
  await page.getByRole('radio', { name: /需小修/ }).click();
  for (const idx of [2, 3, 4]) {
    await page.getByRole('tab', { name: new RegExp(`圖 ${idx}`) }).click();
    await page.getByText('此分格無問題').click();
  }
  await page.getByRole('button', { name: /提交並前往下一張/ }).click();
  // Client-side navigation fires no `load`, so poll the URL instead of waiting for one.
  await expect(page).not.toHaveURL(/\/review\/E5$/);

  // Another attaches to the SAME blueprint but leaves it a draft.
  await page.context().clearCookies();
  await loginAs(page, drafter.username, drafter.password, '**/progress');
  await page.goto('/review/E5');
  await attachPhoto(page);

  // The admin sees exactly one of them.
  await page.context().clearCookies();
  await loginAs(page, adminCreds.username, adminCreds.password, '**/admin/**');
  await page.goto('/admin/dashboard/images/E5');

  await expect(page.getByRole('heading', { name: /E5・/ })).toBeVisible();
  await expect(page.getByText(/參考照片 1 張/)).toBeVisible();

  // Scope to the panel group: the cross-reviewer table below lists names too, and an unscoped
  // match would be ambiguous rather than wrong.
  const panel1 = page.locator('section').filter({ hasText: '圖1（左上）' });
  await expect(panel1.getByText('提交醫師')).toBeVisible();
  await expect(panel1.locator('img[alt="參考照片"]')).toHaveCount(1);

  // The draft reviewer appears NOWHERE on the page — not in the work table, not in the table.
  await expect(page.getByText('草稿醫師')).toHaveCount(0);
});

test('US5: the per-image bundle downloads and is named after the blueprint', async ({ page }) => {
  await loginAs(page, adminCreds.username, adminCreds.password, '**/admin/**');
  await page.goto('/admin/dashboard/images/E5');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: /下載本圖全部材料/ }).click(),
  ]);
  expect(download.suggestedFilename()).toContain('E5');
  expect(download.suggestedFilename()).toMatch(/\.zip$/);
});

test('US5: the image list surfaces which blueprints already have material', async ({ page }) => {
  await loginAs(page, adminCreds.username, adminCreds.password, '**/admin/**');
  await page.goto('/admin/dashboard');

  await page.getByLabel('只看有附照片').check();
  const rows = page.locator('tbody tr');
  await expect(rows.first()).toBeVisible();
  // Every listed row must carry a count — the filter and the column agree.
  const dashes = await rows.locator('td:nth-last-child(2)', { hasText: '—' }).count();
  expect(dashes).toBe(0);
});

test('US5: capacity is visible before it bites', async ({ page }) => {
  await loginAs(page, adminCreds.username, adminCreds.password, '**/admin/**');
  await page.goto('/admin/dashboard');
  await expect(page.getByText('參考照片佔用空間')).toBeVisible();
  await expect(page.getByText(/已用 .* GB \/ .* GB/)).toBeVisible();
});

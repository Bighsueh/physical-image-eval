import { expect, test, type Page } from '@playwright/test';
import { adminContext, seedActiveReviewer, type SeededReviewer } from './api';

/**
 * US8 / US9 E2E — reference photos end to end against the live stack.
 *
 * The properties worth exercising in a real browser (rather than in unit tests) are the ones
 * that only exist once the pieces are wired together: the file actually reaches the server,
 * survives a reload, satisfies the submit gate on its own, and stays out of another reviewer's
 * workspace.
 */
let reviewer: SeededReviewer;
let other: SeededReviewer;

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
  reviewer = await seedActiveReviewer(admin, `e2e_photo_${stamp}`, '照片醫師');
  other = await seedActiveReviewer(admin, `e2e_photo_b_${stamp}`, '旁觀醫師');
  await admin.dispose();
});

async function login(page: Page, who: SeededReviewer) {
  await page.goto('/login');
  await dismissTour(page);
  await page.getByLabel('帳號').fill(who.username);
  await page.getByLabel('密碼').fill(who.password);
  await page.getByRole('button', { name: '登入' }).click();
  await page.waitForURL('**/progress');
}

/**
 * The upload input is visually hidden (the styled label is what the reviewer clicks), so the
 * file is set directly — that is the same code path the click leads to.
 */
/**
 * The first-visit onboarding tour paints a full-page overlay that swallows clicks. Marking it
 * seen is how the app itself remembers, so this is the same state a returning reviewer has —
 * not a test-only bypass.
 */
async function dismissTour(page: Page) {
  await page.evaluate((k) => window.localStorage.setItem(k, '1'), 'pie_review_tour_seen_v1');
}

async function attachPhoto(page: Page, name = 'hand.jpg') {
  // Scope to the active panel's form: the page also carries an image-level upload field, and
  // `.first()` would silently attach to whichever happens to come first in the DOM.
  await page
    .locator('#review-active-panel input[type=file]')
    .setInputFiles({ name, mimeType: 'image/jpeg', buffer: JPEG });
  await expect(page.getByText(/已上傳 [1-9]/).first()).toBeVisible({ timeout: 15_000 });
}

test('US8: a photo attaches, survives reload, and alone satisfies the panel gate', async ({ page }) => {
  await login(page, reviewer);
  await page.goto('/review/E1');

  await attachPhoto(page);
  // The panel tab shows the attachment count, so all four panels are legible at a glance.
  await expect(page.getByRole('tab', { name: /圖 1/ })).toContainText('📎1');
  // Attaching is enough to count as annotating this panel — the nudge says so rather than blocking.
  await expect(page.getByText(/已附參考照片/)).toBeVisible();

  await page.reload();
  await expect(page.getByText('已上傳 1 張').first()).toBeVisible();

  // 圖1 carries only a photo; the other three are signed off.
  await page.getByRole('radio', { name: /需小修/ }).click();
  for (const idx of [2, 3, 4]) {
    await page.getByRole('tab', { name: new RegExp(`圖 ${idx}`) }).click();
    await page.getByText('此分格無問題').click();
  }
  await page.getByRole('button', { name: /提交並前往下一張/ }).click();

  // A document-only gate would have blocked this; the server reads photo counts in the same
  // transaction, so the submit goes through and we advance.
  await expect(page).not.toHaveURL(/\/review\/E1$/);
});

test('US8: a submitted review accepts a photo without regressing or asking for a re-submit', async ({ page }) => {
  await login(page, reviewer);
  await page.goto('/review/E2');
  // The clean-image fast path: 通過 plus the 全部標示無問題 shortcut, which is what satisfies the
  // per-panel gate without visiting all four tabs.
  await page.getByRole('radio', { name: /通過/ }).click();
  await page.getByRole('button', { name: '全部標示無問題' }).click();
  await page.getByRole('button', { name: /提交並前往下一張/ }).click();
  // Client-side navigation fires no `load`, so poll the URL instead of waiting for one.
  await expect(page).not.toHaveURL(/\/review\/E2$/);

  await page.goto('/review/E2');
  await attachPhoto(page, 'after-submit.jpg');
  await page.reload();
  await expect(page.getByText('已上傳 1 張').first()).toBeVisible();
  // Still submitted — the button offers a re-submit, it does not demand one.
  await expect(page.getByRole('button', { name: /再次提交/ })).toBeVisible();
});

test('US8: another reviewer never sees the photo', async ({ page }) => {
  await login(page, other);
  await page.goto('/review/E1');
  await expect(page.getByText('已上傳 0 張').first()).toBeVisible();
  await expect(page.locator('img[alt="參考照片"]')).toHaveCount(0);
});

test('US9: the annotation editor is not in the bundle until it is asked for', async ({ page }) => {
  // Match on "a script was fetched", not on its name: a production build hashes chunk filenames,
  // so asserting they contain "filerobot" passes in dev and silently misses in prod.
  const scripts: string[] = [];
  page.on('request', (req) => {
    if (req.resourceType() === 'script') scripts.push(req.url());
  });

  await login(page, reviewer);
  await page.goto('/review/E1');
  await expect(page.getByText('已上傳 1 張').first()).toBeVisible();
  const beforeClick = scripts.length;

  await page.getByRole('button', { name: '標註' }).first().click();
  await expect(page.getByRole('dialog', { name: '標註照片' })).toBeVisible({ timeout: 20_000 });

  // Opening a review with photos cost nobody the editor; pressing 標註 is what fetches it.
  expect(scripts.length).toBeGreaterThan(beforeClick);
});

test('FR-062: a blocked submit explains itself, and the inline warning survives dismissal', async ({ page }) => {
  await login(page, reviewer);
  await page.goto('/review/E4');

  // No 整體判定 yet — the first thing that blocks.
  await page.getByRole('button', { name: /提交並前往下一張/ }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('還不能提交');
  await expect(dialog).toContainText('整體判定');
  // Both at once (FR-062): the modal makes it noticed, the inline text keeps it visible.
  // Scoped to the submit bar's own alert — the modal body repeats the same words, and the
  // active panel shows its own alert once panels are flagged.
  const inlineWarning = page.locator('#overall-judgement-error');
  await expect(inlineWarning).toHaveText(/請先選擇整體判定/);

  await dialog.getByRole('button', { name: '知道了' }).click();
  await expect(dialog).toBeHidden();
  await expect(inlineWarning).toHaveText(/請先選擇整體判定/); // survives dismissal

  // Judgement chosen; now the unhandled panels are what blocks — and the dialog NAMES them.
  await page.getByRole('radio', { name: /需小修/ }).click();
  await page.getByRole('button', { name: /提交並前往下一張/ }).click();
  await expect(dialog).toContainText('尚未處理');
  await expect(dialog).toContainText('圖 1');
  await expect(inlineWarning).toHaveText(/每個分格請勾選/);

  // The action is the way out: it takes the reviewer to the first unhandled panel.
  await dialog.getByRole('button', { name: /前往圖 1/ }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('tab', { name: /圖 1/ })).toHaveAttribute('aria-selected', 'true');

  // Fix everything; the dialog must not reappear and the submit goes through.
  await page.getByRole('button', { name: '全部標示無問題' }).click();
  await page.getByRole('button', { name: /提交並前往下一張/ }).click();
  await expect(dialog).toBeHidden();
  await expect(page).not.toHaveURL(/\/review\/E4$/);
});

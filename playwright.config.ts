import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E config (constitution VII — critical-flow E2E).
 * baseURL targets the Vite dev server on 5180 (constitution X).
 * The frontend proxies /api → backend :3100, so both must be running.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5180',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});

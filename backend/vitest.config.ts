import { defineConfig } from 'vitest/config';

/**
 * Backend test config (constitution VII — TDD, coverage ≥ 80%).
 * - `vitest run`          → unit + integration, no coverage gate (lets RED tests run).
 * - `vitest run --coverage` (test:coverage) → enforces the lines/branches ≥ 80% gate.
 * DB-backed integration tests use the global setup (migrate test DB) + per-test truncation.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globalSetup: ['./tests/global-setup.ts'],
    setupFiles: ['./tests/setup.ts'],
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 20_000,
    hookTimeout: 60_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: ['src/server.ts', 'src/**/*.d.ts', 'src/config/env.ts'],
      thresholds: { lines: 80, branches: 80, functions: 80, statements: 80 },
    },
  },
});

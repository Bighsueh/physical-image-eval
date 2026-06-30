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
    // Test env (constitution X dev ports; dedicated TEST database). Applied before module load
    // so env.ts validates and the Prisma singleton binds to the test DB. No real secrets here.
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://pie:pie@localhost:5433/physical_image_eval_test?schema=public',
      PORT: '3100',
      SESSION_ABSOLUTE_TTL: '12h',
      SESSION_IDLE_TTL: '60m',
      COOKIE_SECURE: 'false',
      COOKIE_DOMAIN: '',
      COOKIE_SID_NAME: 'pie_sid',
      COOKIE_CSRF_NAME: 'pie_csrf',
      ARGON2_MEMORY_KIB: '19456',
      ARGON2_ITERATIONS: '2',
      ARGON2_PARALLELISM: '1',
      // High max so functional tests never trip the limiter; the limiter's 429 path is tested
      // in isolation with its own low-max instance.
      LOGIN_RATE_MAX: '1000',
      LOGIN_RATE_WINDOW: '15m',
      BOOTSTRAP_ADMIN_USERNAME: 'bootstrap-admin',
      BOOTSTRAP_ADMIN_PASSWORD: 'bootstrap-pass-123',
    },
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

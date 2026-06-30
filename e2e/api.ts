import { type APIRequestContext, request } from '@playwright/test';

/**
 * E2E API seeding helpers — drive the REAL backend (through the frontend proxy or directly) to set
 * up accounts. No DB shortcuts, no special test endpoints (constitution III). The backend under
 * test must be started with the bootstrap admin creds below, and with a HIGH login rate limit
 * (e.g. LOGIN_RATE_MAX=100000) — the suite logs the admin in many times from one IP, which would
 * otherwise trip the production-low dev limit (FR-021).
 */
export const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3100';
export const BOOTSTRAP_USER = process.env.E2E_BOOTSTRAP_USER ?? 'admin';
export const BOOTSTRAP_PASS = process.env.E2E_BOOTSTRAP_PASS ?? 'change-me-on-first-login';
export const ADMIN_NEW_PASS = '112233';

export const csrfOf = async (ctx: APIRequestContext): Promise<string> => {
  const state = await ctx.storageState();
  return state.cookies.find((c) => c.name === 'pie_csrf')?.value ?? '';
};

const post = async (ctx: APIRequestContext, path: string, data: unknown) => {
  const csrf = await csrfOf(ctx);
  return ctx.post(`${API_URL}${path}`, { data, headers: { 'X-CSRF-Token': csrf } });
};

/** Log in the bootstrap admin and, on first run, perform the forced password change. */
export const adminContext = async (): Promise<APIRequestContext> => {
  const ctx = await request.newContext({ baseURL: API_URL });

  // First-run: rotate the forced bootstrap password to a known value.
  const first = await ctx.post('/api/auth/login', {
    data: { username: BOOTSTRAP_USER, password: BOOTSTRAP_PASS },
  });
  const firstBody = await first.json();
  if (first.ok() && firstBody.data?.account?.mustChangePassword) {
    const csrf = await csrfOf(ctx);
    await ctx.post('/api/auth/password', {
      data: { currentPassword: BOOTSTRAP_PASS, newPassword: ADMIN_NEW_PASS },
      headers: { 'X-CSRF-Token': csrf },
    });
  }

  // Establish a clean authenticated session with the now-effective admin password.
  const effective =
    first.ok() && !firstBody.data?.account?.mustChangePassword ? BOOTSTRAP_PASS : ADMIN_NEW_PASS;
  const login = await ctx.post('/api/auth/login', {
    data: { username: BOOTSTRAP_USER, password: effective },
  });
  if (!login.ok()) {
    throw new Error(`admin login failed: ${login.status()} ${await login.text()}`);
  }
  return ctx;
};

export interface SeededReviewer {
  username: string;
  displayName: string;
  password: string;
}

/**
 * Create a reviewer via the admin API and rotate its temp password to a known value (so the UI can
 * log in without the forced-change interstitial). Returns the usable credentials.
 */
export const seedActiveReviewer = async (
  admin: APIRequestContext,
  username: string,
  displayName = '審查醫師',
): Promise<SeededReviewer> => {
  const createRes = await post(admin, '/api/admin/accounts', {
    username,
    displayName,
    role: 'REVIEWER',
  });
  if (!createRes.ok()) {
    throw new Error(`seed create failed: ${createRes.status()} ${await createRes.text()}`);
  }
  const created = await createRes.json();
  const tempPassword: string = created.data.tempPassword;

  // Reviewer logs in with temp pw then sets a known password (clears mustChangePassword).
  const reviewer = await request.newContext();
  await reviewer.post(`${API_URL}/api/auth/login`, { data: { username, password: tempPassword } });
  const csrf = (await reviewer.storageState()).cookies.find((c) => c.name === 'pie_csrf')?.value ?? '';
  const password = '445566';
  await reviewer.post(`${API_URL}/api/auth/password`, {
    data: { currentPassword: tempPassword, newPassword: password },
    headers: { 'X-CSRF-Token': csrf },
  });
  await reviewer.dispose();

  return { username, displayName, password };
};

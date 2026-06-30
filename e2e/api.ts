import { type APIRequestContext, request } from '@playwright/test';

/**
 * E2E API seeding helpers — drive the REAL backend (through the frontend proxy or directly) to set
 * up accounts. No DB shortcuts, no special test endpoints (constitution III). The backend under
 * test must be started with the bootstrap admin creds below.
 */
export const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3100';
export const BOOTSTRAP_USER = process.env.E2E_BOOTSTRAP_USER ?? 'admin';
export const BOOTSTRAP_PASS = process.env.E2E_BOOTSTRAP_PASS ?? 'change-me-on-first-login';
export const ADMIN_NEW_PASS = 'Admin-Strong-Pass-1!';

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
  const ctx = await request.newContext();
  let res = await ctx.post(`${API_URL}/api/auth/login`, {
    data: { username: BOOTSTRAP_USER, password: BOOTSTRAP_PASS },
  });
  let body = await res.json();

  if (body.data?.account?.mustChangePassword) {
    await post(ctx, '/api/auth/password', {
      currentPassword: BOOTSTRAP_PASS,
      newPassword: ADMIN_NEW_PASS,
    });
  } else if (!res.ok()) {
    // Bootstrap password already rotated to ADMIN_NEW_PASS by a previous run.
    res = await ctx.post(`${API_URL}/api/auth/login`, {
      data: { username: BOOTSTRAP_USER, password: ADMIN_NEW_PASS },
    });
    body = await res.json();
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
  const created = await createRes.json();
  const tempPassword: string = created.data.tempPassword;

  // Reviewer logs in with temp pw then sets a known password (clears mustChangePassword).
  const reviewer = await request.newContext();
  await reviewer.post(`${API_URL}/api/auth/login`, { data: { username, password: tempPassword } });
  const csrf = (await reviewer.storageState()).cookies.find((c) => c.name === 'pie_csrf')?.value ?? '';
  const password = 'Reviewer-Strong-Pass-1!';
  await reviewer.post(`${API_URL}/api/auth/password`, {
    data: { currentPassword: tempPassword, newPassword: password },
    headers: { 'X-CSRF-Token': csrf },
  });
  await reviewer.dispose();

  return { username, displayName, password };
};

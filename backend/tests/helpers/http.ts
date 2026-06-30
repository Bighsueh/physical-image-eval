import request from 'supertest';
import type { Account } from '@prisma/client';
import type { Express } from 'express';
import { makeAdmin, makeReviewer, type MakeAccountOverrides } from './factories';

/** Supertest helpers — an agent that persists session cookies + the CSRF token for mutations. */

export interface AuthedAgent {
  agent: ReturnType<typeof request.agent>;
  csrf: string;
  accountId: string;
}

export interface SeededAgent extends AuthedAgent {
  account: Account;
  password: string;
}

export const cookieValue = (res: request.Response, name: string): string => {
  const cookies = (res.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
  const found = cookies.find((c) => c.startsWith(`${name}=`));
  if (!found) return '';
  const eq = found.indexOf('=');
  const semi = found.indexOf(';');
  return found.substring(eq + 1, semi === -1 ? undefined : semi);
};

/** Log in and return an agent (cookie jar) + the CSRF token to echo on mutations. */
export const loginAgent = async (
  app: Express,
  username: string,
  password: string,
): Promise<AuthedAgent> => {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ username, password });
  return {
    agent,
    csrf: cookieValue(res, 'pie_csrf'),
    accountId: res.body?.data?.account?.id ?? '',
  };
};

/** Create an ADMIN (default: password current) and log it in. */
export const adminAgent = async (
  app: Express,
  overrides: MakeAccountOverrides = {},
): Promise<SeededAgent> => {
  const { account, password } = await makeAdmin({ mustChangePassword: false, ...overrides });
  const authed = await loginAgent(app, account.username, password);
  return { ...authed, account, password };
};

/** Create a REVIEWER (default: password current) and log it in. */
export const reviewerAgent = async (
  app: Express,
  overrides: MakeAccountOverrides = {},
): Promise<SeededAgent> => {
  const { account, password } = await makeReviewer({ mustChangePassword: false, ...overrides });
  const authed = await loginAgent(app, account.username, password);
  return { ...authed, account, password };
};

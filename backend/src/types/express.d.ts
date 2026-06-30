import type { Account, Session } from '@prisma/client';

/**
 * Request augmentation: `require-auth` attaches the resolved account + session here. Downstream
 * role / password-current middleware and controllers read from `req.auth` (server-side authority).
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: { account: Account; session: Session };
    }
  }
}

export {};

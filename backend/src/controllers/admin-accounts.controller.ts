import type { RequestHandler } from 'express';
import { toPublicAccount } from '../lib/account-view';
import { list, ok } from '../lib/envelope';
import { AppError } from '../lib/errors';
import { parseBody } from '../lib/parse';
import {
  accountListQuerySchema,
  batchCreateAccountsSchema,
  batchDeleteAccountsSchema,
  createAccountSchema,
} from '../lib/validation';
import {
  createAccount,
  createAccountsBatch,
  deleteAccountsBatch,
  disableAccount,
  enableAccount,
  getAccount,
  listAccounts,
  resetCredential,
} from '../services/account.service';

/**
 * Admin account controllers (US2). Every route is already gated by require-auth +
 * require-role('ADMIN') + require-password-current (routes file). The actor is req.auth.account.id.
 * Responses never include passwordHash (toPublicAccount).
 */
const actorId = (req: Parameters<RequestHandler>[0]): string => req.auth!.account.id;

export const createAccountHandler: RequestHandler = async (req, res, next) => {
  try {
    const body = parseBody(createAccountSchema, req.body);
    const { account, tempPassword } = await createAccount({ actorId: actorId(req), ...body });
    res.status(201).json(ok({ account: toPublicAccount(account), tempPassword }));
  } catch (err) {
    next(err);
  }
};

export const batchCreateHandler: RequestHandler = async (req, res, next) => {
  try {
    const { accounts } = parseBody(batchCreateAccountsSchema, req.body);
    const results = await createAccountsBatch(actorId(req), accounts);
    res.status(201).json(
      ok({
        results: results.map((r) => ({
          username: r.username,
          success: r.success,
          account: r.account ? toPublicAccount(r.account) : null,
          tempPassword: r.tempPassword ?? null,
          error: r.error ?? null,
        })),
      }),
    );
  } catch (err) {
    next(err);
  }
};

export const batchDeleteHandler: RequestHandler = async (req, res, next) => {
  try {
    const { accountIds } = parseBody(batchDeleteAccountsSchema, req.body);
    const results = await deleteAccountsBatch(actorId(req), accountIds);
    res.status(200).json(ok({ results }));
  } catch (err) {
    next(err);
  }
};

export const listAccountsHandler: RequestHandler = async (req, res, next) => {
  try {
    const filters = accountListQuerySchema.parse(req.query);
    const accounts = await listAccounts(filters);
    res
      .status(200)
      .json(list(accounts.map(toPublicAccount), { total: accounts.length, count: accounts.length }));
  } catch (err) {
    next(err);
  }
};

export const accountDetailHandler: RequestHandler = async (req, res, next) => {
  try {
    if (!req.params.id) throw new AppError('ACCOUNT_NOT_FOUND');
    const account = await getAccount(req.params.id);
    res.status(200).json(ok(toPublicAccount(account)));
  } catch (err) {
    next(err);
  }
};

export const disableAccountHandler: RequestHandler = async (req, res, next) => {
  try {
    const account = await disableAccount(actorId(req), req.params.id);
    res.status(200).json(ok(toPublicAccount(account)));
  } catch (err) {
    next(err);
  }
};

export const enableAccountHandler: RequestHandler = async (req, res, next) => {
  try {
    const account = await enableAccount(actorId(req), req.params.id);
    res.status(200).json(ok(toPublicAccount(account)));
  } catch (err) {
    next(err);
  }
};

export const resetCredentialHandler: RequestHandler = async (req, res, next) => {
  try {
    const { account, tempPassword } = await resetCredential(actorId(req), req.params.id);
    res.status(200).json(ok({ account: toPublicAccount(account), tempPassword }));
  } catch (err) {
    next(err);
  }
};

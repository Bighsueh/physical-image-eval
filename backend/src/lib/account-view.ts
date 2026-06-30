import type { Account, Role } from '@prisma/client';

/**
 * Output shapes for Account. NEITHER includes `passwordHash` (never returned by any API, D-model).
 * `displayName` is free text; the React frontend renders it as text (never dangerouslySetInnerHTML),
 * which is the output-sanitization boundary (constitution V).
 */

export interface AuthAccount {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  mustChangePassword: boolean;
}

export interface PublicAccount extends AuthAccount {
  isActive: boolean;
  createdAt: string;
}

/** Minimal account for auth responses (login / session). */
export const toAuthAccount = (a: Account): AuthAccount => ({
  id: a.id,
  username: a.username,
  displayName: a.displayName,
  role: a.role,
  mustChangePassword: a.mustChangePassword,
});

/** Fuller account for admin management responses. */
export const toPublicAccount = (a: Account): PublicAccount => ({
  ...toAuthAccount(a),
  isActive: a.isActive,
  createdAt: a.createdAt.toISOString(),
});

/** Role-based landing target after login (FR-002/FR-003; admin → mgmt; must-change → change). */
export const resolveRedirect = (a: Account): string => {
  if (a.mustChangePassword) return '/password/change';
  return a.role === 'ADMIN' ? '/admin/accounts' : '/progress';
};

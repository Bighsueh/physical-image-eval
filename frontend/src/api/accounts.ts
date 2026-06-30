import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './client';
import type { Role } from './auth';

export interface AdminAccount {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: string;
}

export interface CreateAccountVars {
  displayName: string;
  username: string;
  role: Role;
  /** When set, the admin fixes the password directly (no forced first-login change). */
  password?: string;
}

export interface CredentialResult {
  account: AdminAccount;
  /** `null` when the admin set the password directly. */
  tempPassword: string | null;
}

/** Per-row result from POST /admin/accounts/batch. */
export interface BatchCreateRow {
  username: string;
  success: boolean;
  account: AdminAccount | null;
  tempPassword: string | null;
  error: string | null;
}

/** Per-row result from POST /admin/accounts/batch-delete. */
export interface BatchDeleteRow {
  accountId: string;
  success: boolean;
  error?: string;
}

const ACCOUNTS_KEY = ['accounts'];

export const useAccounts = () =>
  useQuery({
    queryKey: ACCOUNTS_KEY,
    queryFn: async () => (await apiFetch<AdminAccount[]>('/admin/accounts')).data,
  });

export const useCreateAccount = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: CreateAccountVars) =>
      (await apiFetch<CredentialResult>('/admin/accounts', { method: 'POST', body: vars })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ACCOUNTS_KEY }),
  });
};

export const useCreateAccountsBatch = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (accounts: CreateAccountVars[]) =>
      (
        await apiFetch<{ results: BatchCreateRow[] }>('/admin/accounts/batch', {
          method: 'POST',
          body: { accounts },
        })
      ).data.results,
    onSuccess: () => qc.invalidateQueries({ queryKey: ACCOUNTS_KEY }),
  });
};

export const useDeleteAccountsBatch = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (accountIds: string[]) =>
      (
        await apiFetch<{ results: BatchDeleteRow[] }>('/admin/accounts/batch-delete', {
          method: 'POST',
          body: { accountIds },
        })
      ).data.results,
    onSuccess: () => qc.invalidateQueries({ queryKey: ACCOUNTS_KEY }),
  });
};

const useAccountAction = (suffix: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (await apiFetch<unknown>(`/admin/accounts/${id}/${suffix}`, { method: 'POST' })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ACCOUNTS_KEY }),
  });
};

export const useDisableAccount = () => useAccountAction('disable');
export const useEnableAccount = () => useAccountAction('enable');

export const useResetCredential = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (await apiFetch<CredentialResult>(`/admin/accounts/${id}/reset-credential`, { method: 'POST' }))
        .data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ACCOUNTS_KEY }),
  });
};

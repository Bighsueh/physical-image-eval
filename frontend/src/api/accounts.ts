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
}

export interface CredentialResult {
  account: AdminAccount;
  tempPassword: string;
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

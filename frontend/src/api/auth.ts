import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from './client';

export type Role = 'ADMIN' | 'REVIEWER';

export interface AuthAccount {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  mustChangePassword: boolean;
}

export interface LoginResponse {
  account: AuthAccount;
  redirect: string;
}

export interface LoginVars {
  username: string;
  password: string;
}

/** Login mutation (US1). On success the caller stores the account + navigates to `redirect`. */
export const useLogin = () =>
  useMutation({
    mutationFn: async (vars: LoginVars): Promise<LoginResponse> => {
      const { data } = await apiFetch<LoginResponse>('/auth/login', {
        method: 'POST',
        body: vars,
      });
      return data;
    },
  });

export interface ChangePasswordVars {
  currentPassword: string;
  newPassword: string;
}

/** Change own password (forced after create/reset, or voluntary; US2/FR-009). */
export const useChangePassword = () =>
  useMutation({
    mutationFn: async (vars: ChangePasswordVars): Promise<{ passwordChanged: boolean }> => {
      const { data } = await apiFetch<{ passwordChanged: boolean }>('/auth/password', {
        method: 'POST',
        body: vars,
      });
      return data;
    },
  });

/**
 * Restore-on-reopen (US5/FR-016). Returns the current account, or null when there is no valid
 * session (401). Never retried; resolved once at app start to seed the auth state.
 */
export const useSession = () =>
  useQuery({
    queryKey: ['session'],
    retry: false,
    staleTime: Infinity,
    queryFn: async (): Promise<AuthAccount | null> => {
      try {
        const { data } = await apiFetch<{ account: AuthAccount }>('/auth/session');
        return data.account;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
  });

/** Logout (US5/FR-018). Clears the server session; caller clears client state + cache. */
export const useLogout = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<void> => {
      await apiFetch('/auth/logout', { method: 'POST' });
    },
    onSettled: () => qc.clear(),
  });
};

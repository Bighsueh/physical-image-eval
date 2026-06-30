import { useMutation } from '@tanstack/react-query';
import { apiFetch } from './client';

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

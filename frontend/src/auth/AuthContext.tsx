import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { AuthAccount } from '../api/auth';

/**
 * Client-side auth state (defense-in-depth only — the server is the authority). `status` supports
 * US5 restore-on-reopen: 'unknown' while the session query is in flight, then resolved. Set on
 * login; cleared on logout.
 */
export type AuthStatus = 'unknown' | 'authenticated' | 'unauthenticated';

interface AuthState {
  account: AuthAccount | null;
  status: AuthStatus;
  setAccount: (account: AuthAccount | null) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({
  children,
  initialAccount = null,
  initialStatus = 'unauthenticated',
}: {
  children: ReactNode;
  initialAccount?: AuthAccount | null;
  initialStatus?: AuthStatus;
}) {
  const [account, setAccountState] = useState<AuthAccount | null>(initialAccount);
  const [status, setStatus] = useState<AuthStatus>(initialStatus);

  const setAccount = useCallback((next: AuthAccount | null) => {
    setAccountState(next);
    setStatus(next ? 'authenticated' : 'unauthenticated');
  }, []);

  const value = useMemo<AuthState>(
    () => ({ account, status, setAccount }),
    [account, status, setAccount],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth 必須在 AuthProvider 內使用');
  return ctx;
}

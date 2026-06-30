import { useEffect } from 'react';
import { useSession } from '../api/auth';
import { useAuth } from './AuthContext';

/**
 * Restore-on-reopen (US5/FR-016). On mount, resolve the current session once and seed the auth
 * state: a valid session → authenticated; otherwise → unauthenticated. Renders nothing.
 */
export function SessionBootstrap() {
  const { setAccount } = useAuth();
  const { data, isLoading, isError } = useSession();

  useEffect(() => {
    if (isLoading) return;
    setAccount(data ?? null);
  }, [isLoading, isError, data, setAccount]);

  return null;
}

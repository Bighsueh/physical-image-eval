import { Navigate, Outlet } from 'react-router-dom';
import type { Role } from '../api/auth';
import { useAuth } from '../auth/AuthContext';

/**
 * Client route guard — DEFENSE-IN-DEPTH ONLY (constitution IV; the server enforces every gate).
 * No account ⇒ /login. mustChangePassword ⇒ /password/change (unless this IS that route —
 * `allowPasswordChange` — to avoid a redirect loop). Wrong role ⇒ bounce to the caller's own
 * landing (cosmetic; the API still returns 403). While the session resolves (US5), render nothing.
 */
export function ProtectedRoute({
  role,
  allowPasswordChange = false,
}: {
  role?: Role;
  allowPasswordChange?: boolean;
}) {
  const { account, status } = useAuth();

  if (status === 'unknown') return null;
  if (!account) return <Navigate to="/login" replace />;
  if (account.mustChangePassword && !allowPasswordChange) {
    return <Navigate to="/password/change" replace />;
  }
  if (role && account.role !== role) {
    return <Navigate to={account.role === 'ADMIN' ? '/admin/accounts' : '/progress'} replace />;
  }
  return <Outlet />;
}

import { Navigate, Outlet } from 'react-router-dom';
import type { Role } from '../api/auth';
import { useAuth } from '../auth/AuthContext';

/**
 * Client route guard — DEFENSE-IN-DEPTH ONLY (constitution IV; the server enforces every gate).
 * No account ⇒ /login. Wrong role ⇒ bounce to the caller's own landing (cosmetic; the API still
 * returns 403). While the session is still resolving (US5), render nothing to avoid a flash.
 */
export function ProtectedRoute({ role }: { role?: Role }) {
  const { account, status } = useAuth();

  if (status === 'unknown') return null;
  if (!account) return <Navigate to="/login" replace />;
  if (role && account.role !== role) {
    return <Navigate to={account.role === 'ADMIN' ? '/admin/accounts' : '/progress'} replace />;
  }
  return <Outlet />;
}

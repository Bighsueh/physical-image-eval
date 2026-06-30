import type { ReactNode } from 'react';
import type { Role } from '../api/auth';
import { useAuth } from '../auth/AuthContext';

/**
 * Cosmetically hide role-specific UI (e.g. admin navigation) from other roles. DEFENSE-IN-DEPTH
 * ONLY (constitution IV) — the server enforces every gate; absence here is never the control.
 */
export function RoleGate({ role, children }: { role: Role; children: ReactNode }) {
  const { account } = useAuth();
  if (!account || account.role !== role) return null;
  return <>{children}</>;
}

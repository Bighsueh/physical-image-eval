import { useNavigate } from 'react-router-dom';
import { useLogout } from '../api/auth';
import { useAuth } from '../auth/AuthContext';

/** Logout control (US5/FR-018). Ends the server session, clears client state, returns to /login. */
export function LogoutButton({ className }: { className?: string }) {
  const navigate = useNavigate();
  const { setAccount } = useAuth();
  const logout = useLogout();

  const onClick = async () => {
    try {
      await logout.mutateAsync();
    } finally {
      setAccount(null);
      navigate('/login', { replace: true });
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={logout.isPending}
      className={className ?? 'text-sm text-gray-600 hover:text-gray-900 underline'}
    >
      登出
    </button>
  );
}

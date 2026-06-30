import { AlertTriangle } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useChangePassword } from '../api/auth';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/ui';

/**
 * Forced password change after create/reset (FR-009). Passwords are 6 digits. On success clears
 * mustChangePassword in client state and routes to the role-based landing.
 */
export function ForcePasswordChangePage() {
  const navigate = useNavigate();
  const change = useChangePassword();
  const { account, setAccount } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);
    try {
      await change.mutateAsync({ currentPassword, newPassword });
      if (account) setAccount({ ...account, mustChangePassword: false });
      navigate(account?.role === 'ADMIN' ? '/admin/accounts' : '/progress', { replace: true });
    } catch (err) {
      setErrorMessage(err instanceof ApiError ? err.message : '變更失敗，請稍後再試');
    }
  };

  const field =
    'w-full border border-border rounded-xl px-3 py-2 mb-4 bg-white focus:outline-none focus:ring-2 focus:ring-primary';

  return (
    <main className="min-h-screen flex items-center justify-center bg-paper px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm bg-surface border border-border p-8 rounded-2xl shadow-soft"
      >
        <h1 className="text-xl font-bold mb-2 text-ink">變更密碼</h1>
        <p className="text-sm text-ink-soft mb-6">首次登入請先設定新的密碼（6 位數字）。</p>

        <label htmlFor="currentPassword" className="block text-sm font-medium text-ink mb-1">
          目前密碼
        </label>
        <input
          id="currentPassword"
          type="password"
          autoComplete="current-password"
          inputMode="numeric"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
          className={field}
        />

        <label htmlFor="newPassword" className="block text-sm font-medium text-ink mb-1">
          新密碼
        </label>
        <input
          id="newPassword"
          type="password"
          autoComplete="new-password"
          inputMode="numeric"
          pattern="\d{6}"
          maxLength={6}
          minLength={6}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
          className={field}
        />

        {errorMessage && (
          <p role="alert" className="flex items-center gap-1.5 text-sm text-accent-deep mb-4">
            <AlertTriangle className="w-4 h-4" aria-hidden="true" />
            {errorMessage}
          </p>
        )}

        <Button type="submit" loading={change.isPending} className="w-full">
          {change.isPending ? '變更中…' : '變更密碼'}
        </Button>
      </form>
    </main>
  );
}

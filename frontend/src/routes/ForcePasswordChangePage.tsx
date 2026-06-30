import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useChangePassword } from '../api/auth';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';

/**
 * Forced password change after create/reset (FR-009), also usable for voluntary change. On success
 * clears mustChangePassword in client state and routes to the role-based landing.
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

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm bg-white p-8 rounded-lg shadow">
        <h1 className="text-xl font-semibold mb-2 text-gray-900">變更密碼</h1>
        <p className="text-sm text-gray-600 mb-6">首次登入請先設定新的密碼（6 位數字）。</p>

        <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700 mb-1">
          目前密碼
        </label>
        <input
          id="currentPassword"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
          className="w-full border border-gray-300 rounded px-3 py-2 mb-4"
        />

        <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-1">
          新密碼
        </label>
        <input
          id="newPassword"
          type="password"
          autoComplete="new-password"
          inputMode="numeric"
          pattern="\d{6}"
          maxLength={6}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
          minLength={6}
          className="w-full border border-gray-300 rounded px-3 py-2 mb-4"
        />

        {errorMessage && (
          <p role="alert" className="text-sm text-red-700 mb-4">
            <span aria-hidden="true">⚠️ </span>
            {errorMessage}
          </p>
        )}

        <button
          type="submit"
          disabled={change.isPending}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium rounded py-2 disabled:opacity-50"
        >
          {change.isPending ? '變更中…' : '變更密碼'}
        </button>
      </form>
    </main>
  );
}

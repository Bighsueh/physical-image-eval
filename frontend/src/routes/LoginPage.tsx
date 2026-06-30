import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLogin } from '../api/auth';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';

/**
 * The ONLY public screen (constitution III — no registration anywhere). Keyboard-operable native
 * form; error state conveyed by text + icon, not color alone (constitution IX). On success, store
 * the account and navigate to the server-provided role-based redirect.
 */
export function LoginPage() {
  const navigate = useNavigate();
  const login = useLogin();
  const { setAccount } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);
    try {
      const result = await login.mutateAsync({ username, password });
      setAccount(result.account);
      navigate(result.redirect, { replace: true });
    } catch (err) {
      setErrorMessage(err instanceof ApiError ? err.message : '發生未知錯誤，請稍後再試');
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <form
        onSubmit={onSubmit}
        aria-labelledby="login-title"
        className="w-full max-w-sm bg-white p-8 rounded-lg shadow"
      >
        <h1 id="login-title" className="text-xl font-semibold mb-6 text-gray-900">
          運動衛教圖審查工具登入
        </h1>

        <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
          帳號
        </label>
        <input
          id="username"
          name="username"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          className="w-full border border-gray-300 rounded px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
          密碼
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="w-full border border-gray-300 rounded px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        {errorMessage && (
          <p role="alert" className="text-sm text-red-700 mb-4">
            <span aria-hidden="true">⚠️ </span>
            {errorMessage}
          </p>
        )}

        <button
          type="submit"
          disabled={login.isPending}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium rounded py-2 disabled:opacity-50"
        >
          {login.isPending ? '登入中…' : '登入'}
        </button>
      </form>
    </main>
  );
}

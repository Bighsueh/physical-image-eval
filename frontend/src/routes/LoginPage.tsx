import { AlertTriangle } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLogin } from '../api/auth';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/ui';

/**
 * The ONLY public screen (constitution III — no registration anywhere). Warm clinical card on a
 * paper background; keyboard-operable; error state by text + icon, not color alone (constitution IX).
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

  const field =
    'w-full border border-border rounded-xl px-3 py-2 mb-4 bg-white focus:outline-none focus:ring-2 focus:ring-primary';

  return (
    <main className="min-h-screen flex items-center justify-center bg-paper px-4">
      <div className="w-full max-w-sm">
        <div className="bg-primary text-white rounded-2xl px-6 py-4 mb-5 text-center shadow-soft">
          <h1 className="font-brand text-2xl font-bold tracking-wide">運動衛教圖審查</h1>
        </div>
        <form
          onSubmit={onSubmit}
          aria-labelledby="login-title"
          className="bg-surface border border-border p-8 rounded-2xl shadow-soft"
        >
          <h2 id="login-title" className="text-lg font-semibold mb-6 text-ink">
            登入
          </h2>

          <label htmlFor="username" className="block text-sm font-medium text-ink mb-1">
            帳號
          </label>
          <input
            id="username"
            name="username"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            className={field}
          />

          <label htmlFor="password" className="block text-sm font-medium text-ink mb-1">
            密碼
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            inputMode="numeric"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className={field}
          />

          {errorMessage && (
            <p role="alert" className="flex items-center gap-1.5 text-sm text-accent-deep mb-4">
              <AlertTriangle className="w-4 h-4" aria-hidden="true" />
              {errorMessage}
            </p>
          )}

          <Button type="submit" loading={login.isPending} className="w-full">
            {login.isPending ? '登入中…' : '登入'}
          </Button>
        </form>
      </div>
    </main>
  );
}

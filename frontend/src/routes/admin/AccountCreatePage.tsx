import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Role } from '../../api/auth';
import { useCreateAccount, type CredentialResult } from '../../api/accounts';
import { ApiError } from '../../api/client';
import { AppHeader, Button, Card } from '../../components/ui';

/**
 * Admin: create a reviewer/admin account (US2). On success the ONE-TIME 6-digit temp password is
 * shown prominently for out-of-band hand-off (D4) — never retrievable again.
 */
export function AccountCreatePage() {
  const create = useCreateAccount();
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<Role>('REVIEWER');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [created, setCreated] = useState<CredentialResult | null>(null);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);
    try {
      const result = await create.mutateAsync({ displayName, username, role });
      setCreated(result);
      setDisplayName('');
      setUsername('');
      setRole('REVIEWER');
    } catch (err) {
      setErrorMessage(err instanceof ApiError ? err.message : '建立失敗，請稍後再試');
    }
  };

  const field =
    'w-full border border-border rounded-xl px-3 py-2 mb-4 bg-white focus:outline-none focus:ring-2 focus:ring-primary';

  return (
    <div className="min-h-screen bg-paper">
      <AppHeader title="帳號管理" />
      <main className="max-w-lg mx-auto px-6 py-8">
        <Link to="/admin/accounts" className="text-sm text-primary-deep hover:underline">
          ← 返回帳號列表
        </Link>
        <h2 className="text-2xl font-bold text-ink my-4">新增帳號</h2>

        {created && (
          <Card className="mb-6 p-4 border-primary/40 bg-primary-tint/40">
            <p className="flex items-center gap-1.5 font-medium text-primary-deep">
              <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
              已建立帳號 {created.account.displayName}（{created.account.username}）
            </p>
            <p className="mt-2 text-sm text-ink">
              請將以下<strong>一次性臨時密碼</strong>當面／私訊交付對方，此密碼僅顯示一次：
            </p>
            <p className="mt-1 font-mono text-lg bg-white border border-border rounded-xl px-3 py-2 select-all nums">
              {created.tempPassword}
            </p>
            <p className="mt-1 text-xs text-ink-soft">對方首次登入後會被要求變更密碼。</p>
          </Card>
        )}

        <Card className="p-6">
          <form onSubmit={onSubmit}>
            <label htmlFor="displayName" className="block text-sm font-medium text-ink mb-1">
              顯示名稱
            </label>
            <input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              className={field}
            />

            <label htmlFor="username" className="block text-sm font-medium text-ink mb-1">
              帳號識別碼
            </label>
            <input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className={field}
            />

            <label htmlFor="role" className="block text-sm font-medium text-ink mb-1">
              角色
            </label>
            <select
              id="role"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className={field}
            >
              <option value="REVIEWER">審查者</option>
              <option value="ADMIN">系統管理員</option>
            </select>

            {errorMessage && (
              <p role="alert" className="flex items-center gap-1.5 text-sm text-accent-deep mb-4">
                <AlertTriangle className="w-4 h-4" aria-hidden="true" />
                {errorMessage}
              </p>
            )}

            <Button type="submit" loading={create.isPending} className="w-full">
              {create.isPending ? '建立中…' : '建立帳號'}
            </Button>
          </form>
        </Card>
      </main>
    </div>
  );
}

import { type FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Role } from '../../api/auth';
import { useCreateAccount, type CredentialResult } from '../../api/accounts';
import { ApiError } from '../../api/client';

/**
 * Admin: create a reviewer/admin account (US2). On success the ONE-TIME temp password is shown
 * prominently for out-of-band hand-off (D4) — it is never retrievable again.
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

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="max-w-lg mx-auto">
        <Link to="/admin/accounts" className="text-sm text-blue-700">
          ← 返回帳號列表
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900 my-4">新增帳號</h1>

        {created && (
          <div role="status" className="mb-6 rounded border border-green-300 bg-green-50 p-4">
            <p className="font-medium text-green-900">
              ✅ 已建立帳號 {created.account.displayName}（{created.account.username}）
            </p>
            <p className="mt-2 text-sm text-gray-700">
              請將以下<strong>一次性臨時密碼</strong>當面／私訊交付對方，此密碼僅顯示一次：
            </p>
            <p className="mt-1 font-mono text-lg bg-white border rounded px-3 py-2 select-all">
              {created.tempPassword}
            </p>
            <p className="mt-1 text-xs text-gray-500">對方首次登入後會被要求變更密碼。</p>
          </div>
        )}

        <form onSubmit={onSubmit} className="bg-white p-6 rounded-lg shadow">
          <label htmlFor="displayName" className="block text-sm font-medium text-gray-700 mb-1">
            顯示名稱
          </label>
          <input
            id="displayName"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            className="w-full border border-gray-300 rounded px-3 py-2 mb-4"
          />

          <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
            帳號識別碼
          </label>
          <input
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            className="w-full border border-gray-300 rounded px-3 py-2 mb-4"
          />

          <label htmlFor="role" className="block text-sm font-medium text-gray-700 mb-1">
            角色
          </label>
          <select
            id="role"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="w-full border border-gray-300 rounded px-3 py-2 mb-4"
          >
            <option value="REVIEWER">審查者</option>
            <option value="ADMIN">系統管理員</option>
          </select>

          {errorMessage && (
            <p role="alert" className="text-sm text-red-700 mb-4">
              <span aria-hidden="true">⚠️ </span>
              {errorMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={create.isPending}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium rounded py-2 disabled:opacity-50"
          >
            {create.isPending ? '建立中…' : '建立帳號'}
          </button>
        </form>
      </div>
    </main>
  );
}

import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  useAccounts,
  useDisableAccount,
  useEnableAccount,
  useResetCredential,
  type AdminAccount,
} from '../../api/accounts';
import { LogoutButton } from '../../components/LogoutButton';

const ROLE_LABEL: Record<string, string> = { ADMIN: '系統管理員', REVIEWER: '審查者' };

/** Admin account list with per-row enable/disable/reset (US2). Status shown by text, not color. */
export function AccountsListPage() {
  const { data: accounts, isLoading, isError } = useAccounts();
  const disable = useDisableAccount();
  const enable = useEnableAccount();
  const reset = useResetCredential();
  const [resetPassword, setResetPassword] = useState<{ username: string; tempPassword: string } | null>(
    null,
  );

  const onReset = async (acc: AdminAccount) => {
    const result = await reset.mutateAsync(acc.id);
    setResetPassword({ username: acc.username, tempPassword: result.tempPassword });
  };

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">帳號管理</h1>
          <div className="flex items-center gap-4">
            <Link
              to="/admin/accounts/new"
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded px-4 py-2"
            >
              新增帳號
            </Link>
            <LogoutButton />
          </div>
        </div>

        {resetPassword && (
          <div role="status" className="mb-6 rounded border border-green-300 bg-green-50 p-4">
            <p className="text-sm text-gray-700">
              已重設 <strong>{resetPassword.username}</strong> 的憑證，一次性臨時密碼：
            </p>
            <p className="mt-1 font-mono text-lg bg-white border rounded px-3 py-2 select-all">
              {resetPassword.tempPassword}
            </p>
          </div>
        )}

        {isLoading && <p>載入中…</p>}
        {isError && <p role="alert">無法載入帳號列表</p>}

        {accounts && (
          <table className="w-full bg-white rounded-lg shadow text-left text-sm">
            <thead>
              <tr className="border-b text-gray-600">
                <th className="px-4 py-3">顯示名稱</th>
                <th className="px-4 py-3">帳號</th>
                <th className="px-4 py-3">角色</th>
                <th className="px-4 py-3">狀態</th>
                <th className="px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((acc) => (
                <tr key={acc.id} className="border-b last:border-0">
                  <td className="px-4 py-3">{acc.displayName}</td>
                  <td className="px-4 py-3 font-mono">{acc.username}</td>
                  <td className="px-4 py-3">{ROLE_LABEL[acc.role] ?? acc.role}</td>
                  <td className="px-4 py-3">
                    {acc.isActive ? (
                      <span className="text-green-700">● 在職</span>
                    ) : (
                      <span className="text-gray-500">○ 非在職</span>
                    )}
                  </td>
                  <td className="px-4 py-3 space-x-2 whitespace-nowrap">
                    {acc.isActive ? (
                      <button
                        type="button"
                        onClick={() => disable.mutate(acc.id)}
                        className="text-red-700 hover:underline"
                      >
                        停用
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => enable.mutate(acc.id)}
                        className="text-green-700 hover:underline"
                      >
                        啟用
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onReset(acc)}
                      className="text-blue-700 hover:underline"
                    >
                      重設密碼
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}

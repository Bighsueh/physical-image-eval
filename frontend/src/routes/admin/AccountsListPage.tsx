import { AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  useAccounts,
  useDisableAccount,
  useEnableAccount,
  useResetCredential,
  type AdminAccount,
} from '../../api/accounts';
import { ApiError } from '../../api/client';
import { AppHeader, Card, StatusPill } from '../../components/ui';

const ROLE_LABEL: Record<string, string> = { ADMIN: '系統管理員', REVIEWER: '審查者' };

/** Admin account list with per-row enable/disable/reset (US2). Status shown by text + icon. */
export function AccountsListPage() {
  const { data: accounts, isLoading, isError } = useAccounts();
  const disable = useDisableAccount();
  const enable = useEnableAccount();
  const reset = useResetCredential();
  const [resetPassword, setResetPassword] = useState<{ username: string; tempPassword: string } | null>(
    null,
  );
  const [actionError, setActionError] = useState<string | null>(null);

  const runAction = async (fn: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await fn();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : '操作失敗，請稍後再試');
    }
  };

  const onReset = (acc: AdminAccount) =>
    runAction(async () => {
      const result = await reset.mutateAsync(acc.id);
      setResetPassword({ username: acc.username, tempPassword: result.tempPassword });
    });

  return (
    <div className="min-h-screen bg-paper">
      <AppHeader title="帳號管理" />
      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-ink">帳號管理</h2>
          <Link
            to="/admin/accounts/new"
            className="inline-flex items-center min-h-[44px] bg-primary hover:bg-primary-deep text-white text-sm font-medium rounded-xl px-4"
          >
            新增帳號
          </Link>
        </div>

        {resetPassword && (
          <Card className="mb-6 p-4 border-primary/40 bg-primary-tint/40">
            <p className="text-sm text-ink">
              已重設 <strong>{resetPassword.username}</strong> 的憑證，一次性臨時密碼：
            </p>
            <p className="mt-1 font-mono text-lg bg-white border border-border rounded-xl px-3 py-2 select-all nums">
              {resetPassword.tempPassword}
            </p>
          </Card>
        )}

        {actionError && (
          <p role="alert" className="mb-4 flex items-center gap-1.5 text-sm text-accent-deep">
            <AlertTriangle className="w-4 h-4" aria-hidden="true" />
            {actionError}
          </p>
        )}

        {isLoading && <p className="text-ink-soft">載入中…</p>}
        {isError && <p role="alert">無法載入帳號列表</p>}

        {accounts && (
          <Card className="overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-surface-sunken text-ink-soft border-b border-border">
                  <th className="px-4 py-3 font-medium">顯示名稱</th>
                  <th className="px-4 py-3 font-medium">帳號</th>
                  <th className="px-4 py-3 font-medium">角色</th>
                  <th className="px-4 py-3 font-medium">狀態</th>
                  <th className="px-4 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((acc) => (
                  <tr key={acc.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 text-ink">{acc.displayName}</td>
                    <td className="px-4 py-3 font-mono text-ink">{acc.username}</td>
                    <td className="px-4 py-3 text-ink">{ROLE_LABEL[acc.role] ?? acc.role}</td>
                    <td className="px-4 py-3">
                      <StatusPill status={acc.isActive ? 'active' : 'inactive'} size="sm" />
                    </td>
                    <td className="px-4 py-3 space-x-3 whitespace-nowrap">
                      {acc.isActive ? (
                        <button
                          type="button"
                          onClick={() => runAction(() => disable.mutateAsync(acc.id))}
                          className="text-accent-deep hover:underline"
                        >
                          停用
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => runAction(() => enable.mutateAsync(acc.id))}
                          className="text-primary-deep hover:underline"
                        >
                          啟用
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onReset(acc)}
                        className="text-primary-deep hover:underline"
                      >
                        重設密碼
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </main>
    </div>
  );
}

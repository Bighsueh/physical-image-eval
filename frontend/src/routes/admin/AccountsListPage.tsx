import { AlertTriangle, CheckCircle2, Trash2, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  useAccounts,
  useDeleteAccountsBatch,
  useDisableAccount,
  useEnableAccount,
  useResetCredential,
  type AdminAccount,
  type BatchDeleteRow,
} from '../../api/accounts';
import { ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { AppHeader, Button, Card, ConfirmDialog, StatusPill } from '../../components/ui';

const ROLE_LABEL: Record<string, string> = { ADMIN: '系統管理員', REVIEWER: '審查者' };

/**
 * Admin account list with per-row enable/disable/reset and multi-select batch delete (US2 + the
 * 2026-07-01 clarification). Delete is destructive, so it goes through a reconfirm dialog; the
 * server blocks accounts that already have submitted reviews (use 停用 instead) and surfaces those
 * as per-row failures.
 */
export function AccountsListPage() {
  const { account: me } = useAuth();
  const { data: accounts, isLoading, isError } = useAccounts();
  const disable = useDisableAccount();
  const enable = useEnableAccount();
  const reset = useResetCredential();
  const batchDelete = useDeleteAccountsBatch();

  const [resetPassword, setResetPassword] = useState<{ username: string; tempPassword: string } | null>(
    null,
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteResults, setDeleteResults] = useState<BatchDeleteRow[] | null>(null);

  // An admin can never delete their own account — exclude it from selection entirely (the server
  // also enforces this, but hiding the affordance is clearer).
  const deletableIds = useMemo(
    () => new Set((accounts ?? []).filter((a) => a.id !== me?.id).map((a) => a.id)),
    [accounts, me?.id],
  );
  const usernameById = useMemo(
    () => new Map((accounts ?? []).map((a) => [a.id, a.username])),
    [accounts],
  );

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
      if (result.tempPassword) setResetPassword({ username: acc.username, tempPassword: result.tempPassword });
    });

  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allSelected = deletableIds.size > 0 && selected.size === deletableIds.size;
  const toggleAll = () =>
    setSelected((prev) => (prev.size === deletableIds.size ? new Set() : new Set(deletableIds)));

  const confirmDelete = async () => {
    const ids = [...selected];
    await runAction(async () => {
      const results = await batchDelete.mutateAsync(ids);
      setDeleteResults(results);
      // Keep only the still-existing (failed) selections so the admin can act on them (e.g. 停用).
      const failed = new Set(results.filter((r) => !r.success).map((r) => r.accountId));
      setSelected((prev) => new Set([...prev].filter((id) => failed.has(id))));
    });
    setConfirmOpen(false);
  };

  return (
    <div className="min-h-screen bg-paper">
      <AppHeader
        title="帳號管理"
        right={
          <Link to="/admin/dashboard" className="text-white/90 hover:text-white underline">
            審查儀表板
          </Link>
        }
      />
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

        {deleteResults && (
          <Card className="mb-6 p-4" aria-live="polite">
            <h3 className="text-sm font-bold text-ink mb-2">刪除結果</h3>
            <ul className="space-y-1.5">
              {deleteResults.map((r) => (
                <li key={r.accountId} className="flex flex-wrap items-center gap-2 text-sm">
                  {r.success ? (
                    <CheckCircle2 className="w-4 h-4 text-primary-deep shrink-0" aria-hidden="true" />
                  ) : (
                    <XCircle className="w-4 h-4 text-accent-deep shrink-0" aria-hidden="true" />
                  )}
                  <span className="font-mono text-ink">{usernameById.get(r.accountId) ?? r.accountId}</span>
                  {r.success ? (
                    <span className="text-ink-soft">已刪除</span>
                  ) : (
                    <span className="text-accent-deep">{r.error ?? '刪除失敗'}</span>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}

        {actionError && (
          <p role="alert" className="mb-4 flex items-center gap-1.5 text-sm text-accent-deep">
            <AlertTriangle className="w-4 h-4" aria-hidden="true" />
            {actionError}
          </p>
        )}

        {selected.size > 0 && (
          <div className="mb-4 flex items-center justify-between rounded-xl border border-border bg-surface-sunken px-4 py-3">
            <span className="text-sm text-ink">已選取 {selected.size} 個帳號</span>
            <Button variant="danger" onClick={() => setConfirmOpen(true)}>
              <Trash2 className="w-4 h-4" aria-hidden="true" />
              批量刪除
            </Button>
          </div>
        )}

        {isLoading && <p className="text-ink-soft">載入中…</p>}
        {isError && <p role="alert">無法載入帳號列表</p>}

        {accounts && (
          <Card className="overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-surface-sunken text-ink-soft border-b border-border">
                  <th className="px-4 py-3 font-medium w-10">
                    <input
                      type="checkbox"
                      aria-label="全選可刪除的帳號"
                      checked={allSelected}
                      onChange={toggleAll}
                      disabled={deletableIds.size === 0}
                    />
                  </th>
                  <th className="px-4 py-3 font-medium">顯示名稱</th>
                  <th className="px-4 py-3 font-medium">帳號</th>
                  <th className="px-4 py-3 font-medium">角色</th>
                  <th className="px-4 py-3 font-medium">狀態</th>
                  <th className="px-4 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((acc) => {
                  const isMe = acc.id === me?.id;
                  return (
                    <tr key={acc.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          aria-label={`選取 ${acc.username}`}
                          checked={selected.has(acc.id)}
                          onChange={() => toggleOne(acc.id)}
                          disabled={isMe}
                          title={isMe ? '無法刪除自己的帳號' : undefined}
                        />
                      </td>
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
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}
      </main>

      <ConfirmDialog
        open={confirmOpen}
        title={`刪除 ${selected.size} 個帳號？`}
        confirmLabel={`刪除 ${selected.size} 個帳號`}
        loading={batchDelete.isPending}
        onConfirm={confirmDelete}
        onCancel={() => setConfirmOpen(false)}
      >
        <p>此操作無法復原。已有<strong>提交審查紀錄</strong>的帳號將被保護而無法刪除，請改用「停用」。</p>
        <p className="mt-2 text-ink-soft">沒有提交紀錄的帳號（含其草稿）會被永久移除；審計紀錄仍會保留。</p>
      </ConfirmDialog>
    </div>
  );
}

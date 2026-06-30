import { CheckCircle2, Eye, EyeOff, Plus, Trash2, XCircle } from 'lucide-react';
import { useRef, useState } from 'react';
import {
  type BatchCreateRow,
  type CreateAccountVars,
  useCreateAccountsBatch,
} from '../../api/accounts';
import type { Role } from '../../api/auth';
import { ApiError } from '../../api/client';
import { Button } from '../ui';
import { PASSWORD_MIN } from './PasswordModeFields';

interface DraftRow {
  key: string;
  displayName: string;
  username: string;
  role: Role;
  password: string; // empty = system-issued one-time temp password
}

const cell = 'w-full border border-border rounded-lg px-2 py-1.5 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary';
const MAX_ROWS = 100;

const emptyRow = (key: string): DraftRow => ({ key, displayName: '', username: '', role: 'REVIEWER', password: '' });

/**
 * Batch-create editor: a small spreadsheet of accounts. An empty password column means the system
 * issues a one-time temp password (forced change); a filled one (≥6 chars) is set directly. The
 * server processes each row best-effort, so one bad row never fails the rest — results are shown
 * per row, including the one-time temp passwords that must be handed off out-of-band.
 */
export function BatchCreatePanel() {
  const batch = useCreateAccountsBatch();
  const counter = useRef(1);
  const [rows, setRows] = useState<DraftRow[]>([emptyRow('r0')]);
  const [results, setResults] = useState<BatchCreateRow[] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [revealPw, setRevealPw] = useState(false); // masks the whole password column by default

  const addRow = () =>
    setRows((prev) => (prev.length >= MAX_ROWS ? prev : [...prev, emptyRow(`r${counter.current++}`)]));

  const removeRow = (key: string) =>
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((r) => r.key !== key)));

  const patchRow = (key: string, patch: Partial<DraftRow>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  // Rows that carry any content (so a stray blank row at the end is ignored).
  const filled = rows.filter((r) => r.username.trim() !== '' || r.displayName.trim() !== '');
  const hasShortPassword = filled.some((r) => r.password !== '' && r.password.length < PASSWORD_MIN);
  const hasIncompleteRow = filled.some((r) => r.username.trim() === '' || r.displayName.trim() === '');
  const canSubmit = filled.length > 0 && !hasShortPassword && !hasIncompleteRow;

  const onSubmit = async () => {
    setErrorMessage(null);
    if (!canSubmit) return;
    const accounts: CreateAccountVars[] = filled.map((r) => ({
      displayName: r.displayName.trim(),
      username: r.username.trim(),
      role: r.role,
      ...(r.password !== '' ? { password: r.password } : {}),
    }));
    try {
      const res = await batch.mutateAsync(accounts);
      setResults(res);
      // Drop rows that succeeded; keep failures (e.g. duplicate username) for correction + retry.
      const ok = new Set(res.filter((x) => x.success).map((x) => x.username.toLowerCase()));
      setRows((prev) => {
        const kept = prev.filter((r) => !ok.has(r.username.trim().toLowerCase()));
        return kept.length > 0 ? kept : [emptyRow(`r${counter.current++}`)];
      });
    } catch (err) {
      setErrorMessage(err instanceof ApiError ? err.message : '批量建立失敗，請稍後再試');
    }
  };

  return (
    <div>
      <p className="text-sm text-ink-soft mb-3">
        每列一個帳號。<strong>密碼</strong>留空＝系統產生一次性臨時密碼（首次登入需變更）；填寫＝直接設定（至少 {PASSWORD_MIN} 字元）。
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-ink-soft">
              <th className="px-2 py-1 font-medium">顯示名稱</th>
              <th className="px-2 py-1 font-medium">帳號識別碼</th>
              <th className="px-2 py-1 font-medium">角色</th>
              <th className="px-2 py-1 font-medium">
                <span className="inline-flex items-center gap-1">
                  密碼（選填）
                  <button
                    type="button"
                    onClick={() => setRevealPw((v) => !v)}
                    aria-label={revealPw ? '隱藏所有密碼' : '顯示所有密碼'}
                    aria-pressed={revealPw}
                    className="inline-flex h-6 w-6 items-center justify-center rounded text-ink-soft hover:text-ink"
                  >
                    {revealPw ? (
                      <EyeOff className="w-4 h-4" aria-hidden="true" />
                    ) : (
                      <Eye className="w-4 h-4" aria-hidden="true" />
                    )}
                  </button>
                </span>
              </th>
              <th className="px-2 py-1 font-medium sr-only">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const shortPw = row.password !== '' && row.password.length < PASSWORD_MIN;
              return (
                <tr key={row.key}>
                  <td className="px-2 py-1 align-top">
                    <input
                      aria-label={`第 ${idx + 1} 列 顯示名稱`}
                      value={row.displayName}
                      onChange={(e) => patchRow(row.key, { displayName: e.target.value })}
                      className={cell}
                    />
                  </td>
                  <td className="px-2 py-1 align-top">
                    <input
                      aria-label={`第 ${idx + 1} 列 帳號識別碼`}
                      value={row.username}
                      onChange={(e) => patchRow(row.key, { username: e.target.value })}
                      className={`${cell} font-mono`}
                    />
                  </td>
                  <td className="px-2 py-1 align-top">
                    <select
                      aria-label={`第 ${idx + 1} 列 角色`}
                      value={row.role}
                      onChange={(e) => patchRow(row.key, { role: e.target.value as Role })}
                      className={cell}
                    >
                      <option value="REVIEWER">審查者</option>
                      <option value="ADMIN">系統管理員</option>
                    </select>
                  </td>
                  <td className="px-2 py-1 align-top">
                    <input
                      aria-label={`第 ${idx + 1} 列 密碼`}
                      type={revealPw ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={row.password}
                      onChange={(e) => patchRow(row.key, { password: e.target.value })}
                      placeholder="留空＝臨時密碼"
                      className={`${cell} ${shortPw ? 'border-accent-deep' : ''}`}
                    />
                    {shortPw && <p className="mt-0.5 text-xs text-accent-deep">至少 {PASSWORD_MIN} 字元</p>}
                  </td>
                  <td className="px-2 py-1 align-top">
                    <button
                      type="button"
                      onClick={() => removeRow(row.key)}
                      disabled={rows.length === 1}
                      aria-label={`刪除第 ${idx + 1} 列`}
                      className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-ink-soft hover:text-accent-deep disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          onClick={addRow}
          disabled={rows.length >= MAX_ROWS}
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          新增一列
        </Button>
        <Button type="button" onClick={onSubmit} loading={batch.isPending} disabled={!canSubmit}>
          {batch.isPending ? '建立中…' : `建立 ${filled.length} 個帳號`}
        </Button>
      </div>

      {errorMessage && (
        <p role="alert" className="mt-3 text-sm text-accent-deep">
          {errorMessage}
        </p>
      )}

      {results && (
        <div className="mt-6" aria-live="polite">
          <h3 className="text-sm font-bold text-ink mb-2">建立結果</h3>
          <ul className="space-y-1.5">
            {results.map((r) => (
              <li
                key={r.username}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm"
              >
                {r.success ? (
                  <CheckCircle2 className="w-4 h-4 text-primary-deep shrink-0" aria-hidden="true" />
                ) : (
                  <XCircle className="w-4 h-4 text-accent-deep shrink-0" aria-hidden="true" />
                )}
                <span className="font-mono text-ink">{r.username}</span>
                {r.success ? (
                  r.tempPassword ? (
                    <span className="text-ink-soft">
                      一次性臨時密碼：
                      <span className="font-mono text-ink select-all nums">{r.tempPassword}</span>
                    </span>
                  ) : (
                    <span className="text-ink-soft">已依指定密碼建立</span>
                  )
                ) : (
                  <span className="text-accent-deep">{r.error}</span>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink-soft">
            臨時密碼僅顯示一次，請立即複製並當面／私訊交付對方。
          </p>
        </div>
      )}
    </div>
  );
}

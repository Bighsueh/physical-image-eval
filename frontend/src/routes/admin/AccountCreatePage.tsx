import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { type FormEvent, type KeyboardEvent, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Role } from '../../api/auth';
import { useCreateAccount, type CredentialResult } from '../../api/accounts';
import { ApiError } from '../../api/client';
import { BatchCreatePanel } from '../../components/admin/BatchCreatePanel';
import { PasswordModeFields, type PasswordMode } from '../../components/admin/PasswordModeFields';
import { AppHeader, Button, Card } from '../../components/ui';

type Tab = 'single' | 'batch';

const TAB_ORDER: Tab[] = ['single', 'batch'];
const TAB_LABEL: Record<Tab, string> = { single: '單筆新增', batch: '批量新增' };

/**
 * Admin: create accounts (US2). Single mode supports two password rules (2026-07-01 clarification):
 * a system one-time temp password (forced change), or an admin-set password (no forced change).
 * Batch mode creates many at once. The one-time temp password is shown once for out-of-band hand-off.
 */
export function AccountCreatePage() {
  const create = useCreateAccount();
  const [tab, setTab] = useState<Tab>('single');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<Role>('REVIEWER');
  const [passwordMode, setPasswordMode] = useState<PasswordMode>('temp');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [created, setCreated] = useState<CredentialResult | null>(null);
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ single: null, batch: null });

  // ARIA tabs: Left/Right move between tabs (roving tabindex) and focus the newly selected tab.
  const onTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const idx = TAB_ORDER.indexOf(tab);
    const delta = event.key === 'ArrowRight' ? 1 : -1;
    const next = TAB_ORDER[(idx + delta + TAB_ORDER.length) % TAB_ORDER.length];
    setTab(next);
    tabRefs.current[next]?.focus();
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);
    try {
      const result = await create.mutateAsync({
        displayName,
        username,
        role,
        ...(passwordMode === 'set' ? { password } : {}),
      });
      setCreated(result);
      setDisplayName('');
      setUsername('');
      setRole('REVIEWER');
      setPasswordMode('temp');
      setPassword('');
    } catch (err) {
      setErrorMessage(err instanceof ApiError ? err.message : '建立失敗，請稍後再試');
    }
  };

  const field =
    'w-full border border-border rounded-xl px-3 py-2 mb-4 bg-white focus:outline-none focus:ring-2 focus:ring-primary';
  const tabCls = (active: boolean) =>
    `min-h-[44px] px-4 rounded-xl text-sm font-medium ${
      active ? 'bg-primary text-white' : 'bg-surface text-ink border border-border hover:bg-surface-sunken'
    }`;

  return (
    <div className="min-h-screen bg-paper">
      <AppHeader title="帳號管理" />
      <main className={`mx-auto px-6 py-8 ${tab === 'batch' ? 'max-w-4xl' : 'max-w-lg'}`}>
        <Link to="/admin/accounts" className="text-sm text-primary-deep hover:underline">
          ← 返回帳號列表
        </Link>
        <h2 className="text-2xl font-bold text-ink my-4">新增帳號</h2>

        <div className="flex gap-2 mb-6" role="tablist" aria-label="新增方式" onKeyDown={onTabKeyDown}>
          {TAB_ORDER.map((t) => (
            <button
              key={t}
              ref={(el) => {
                tabRefs.current[t] = el;
              }}
              type="button"
              role="tab"
              id={`tab-${t}`}
              aria-selected={tab === t}
              aria-controls={`panel-${t}`}
              tabIndex={tab === t ? 0 : -1}
              onClick={() => setTab(t)}
              className={tabCls(tab === t)}
            >
              {TAB_LABEL[t]}
            </button>
          ))}
        </div>

        <div
          role="tabpanel"
          id="panel-single"
          aria-labelledby="tab-single"
          tabIndex={0}
          hidden={tab !== 'single'}
          className="focus:outline-none"
        >
          {created && (
            <Card className="mb-6 p-4 border-primary/40 bg-primary-tint/40">
              <p className="flex items-center gap-1.5 font-medium text-primary-deep">
                <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                已建立帳號 {created.account.displayName}（{created.account.username}）
              </p>
              {created.tempPassword ? (
                <>
                  <p className="mt-2 text-sm text-ink">
                    請將以下<strong>一次性臨時密碼</strong>當面／私訊交付對方，此密碼僅顯示一次：
                  </p>
                  <p className="mt-1 font-mono text-lg bg-white border border-border rounded-xl px-3 py-2 select-all nums">
                    {created.tempPassword}
                  </p>
                  <p className="mt-1 text-xs text-ink-soft">對方首次登入後會被要求變更密碼。</p>
                </>
              ) : (
                <p className="mt-2 text-sm text-ink">
                  已依您設定的密碼建立帳號，對方可直接登入，不需變更密碼。
                </p>
              )}
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

              <PasswordModeFields
                mode={passwordMode}
                onModeChange={setPasswordMode}
                password={password}
                onPasswordChange={setPassword}
              />

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
        </div>

        <div
          role="tabpanel"
          id="panel-batch"
          aria-labelledby="tab-batch"
          tabIndex={0}
          hidden={tab !== 'batch'}
          className="focus:outline-none"
        >
          <Card className="p-6">
            <BatchCreatePanel />
          </Card>
        </div>
      </main>
    </div>
  );
}

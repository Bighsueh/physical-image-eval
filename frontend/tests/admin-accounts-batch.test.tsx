import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountCreatePage } from '../src/routes/admin/AccountCreatePage';
import { AccountsListPage } from '../src/routes/admin/AccountsListPage';
import type { AuthAccount } from '../src/api/auth';
import { renderWithProviders } from './helpers';

/** Build an ok/err envelope response, matching apiFetch's expectations. */
const res = (data: unknown, init: { ok?: boolean; status?: number } = {}) => ({
  ok: init.ok ?? true,
  status: init.status ?? 200,
  json: async () => ({ success: init.ok ?? true, data, error: init.ok === false ? data : null }),
});

const account = (over: Partial<Record<string, unknown>> = {}) => ({
  id: '1',
  username: 'dr.lin',
  displayName: '林醫師',
  role: 'REVIEWER',
  isActive: true,
  mustChangePassword: false,
  createdAt: '2026-07-01T00:00:00Z',
  ...over,
});

/** Route fetch by URL + method so a flow with several endpoints can be exercised. */
const routeFetch = (handlers: Record<string, (body: unknown) => ReturnType<typeof res>>) =>
  vi.fn().mockImplementation((url: string, init?: { method?: string; body?: string }) => {
    const method = init?.method ?? 'GET';
    const key = `${method} ${url}`;
    const handler = handlers[key];
    if (!handler) throw new Error(`unexpected fetch: ${key}`);
    return Promise.resolve(handler(init?.body ? JSON.parse(init.body) : undefined));
  });

describe('AccountCreatePage — admin-set password', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reveals the password field and sends the chosen password; success shows the no-temp message', async () => {
    const fetchMock = routeFetch({
      'POST /api/admin/accounts': () =>
        res({ account: account({ mustChangePassword: false }), tempPassword: null }, { status: 201 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(<AccountCreatePage />);
    await userEvent.type(screen.getByLabelText('顯示名稱'), '林醫師');
    await userEvent.type(screen.getByLabelText('帳號識別碼'), 'dr.lin');
    await userEvent.click(screen.getByRole('radio', { name: /由我直接設定密碼/ }));
    await userEvent.type(screen.getByLabelText(/密碼（至少/), 'clinic2026');
    await userEvent.click(screen.getByRole('button', { name: '建立帳號' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
    expect(body.password).toBe('clinic2026');
    expect(await screen.findByText(/已依您設定的密碼建立/)).toBeInTheDocument();
  });
});

describe('AccountCreatePage — batch create', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('submits the batch and shows per-row results including the temp password', async () => {
    const fetchMock = routeFetch({
      'POST /api/admin/accounts/batch': () =>
        res(
          {
            results: [
              { username: 'dr.a', success: true, account: account({ id: '9', username: 'dr.a' }), tempPassword: '654321', error: null },
            ],
          },
          { status: 201 },
        ),
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(<AccountCreatePage />);
    await userEvent.click(screen.getByRole('tab', { name: '批量新增' }));
    await userEvent.type(screen.getByLabelText('第 1 列 顯示名稱'), '甲醫師');
    await userEvent.type(screen.getByLabelText('第 1 列 帳號識別碼'), 'dr.a');
    await userEvent.click(screen.getByRole('button', { name: '建立 1 個帳號' }));

    expect(await screen.findByText('建立結果')).toBeInTheDocument();
    expect(screen.getByText('dr.a')).toBeInTheDocument();
    expect(screen.getByText('654321')).toBeInTheDocument();
  });
});

describe('AccountsListPage — batch delete', () => {
  afterEach(() => vi.unstubAllGlobals());

  const me: AuthAccount = {
    id: '1',
    username: 'admin',
    displayName: '管理員',
    role: 'ADMIN',
    mustChangePassword: false,
  };

  it('disables the self checkbox and deletes a selected reviewer after confirmation', async () => {
    const list = [
      account({ id: '1', username: 'admin', displayName: '管理員', role: 'ADMIN' }),
      account({ id: '2', username: 'dr.rev', displayName: '審查醫師', role: 'REVIEWER' }),
    ];
    const fetchMock = routeFetch({
      'GET /api/admin/accounts': () => res(list),
      'POST /api/admin/accounts/batch-delete': () => res({ results: [{ accountId: '2', success: true }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(<AccountsListPage />, { account: me, status: 'authenticated' });
    await screen.findByText('dr.rev');

    // Self row checkbox is disabled; reviewer row is selectable.
    expect(screen.getByLabelText('選取 admin')).toBeDisabled();
    await userEvent.click(screen.getByLabelText('選取 dr.rev'));
    expect(screen.getByText('已選取 1 個帳號')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /批量刪除/ }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: '刪除 1 個帳號' }));

    expect(await screen.findByText('刪除結果')).toBeInTheDocument();
    const deleteCall = fetchMock.mock.calls.find((c) => String(c[0]).endsWith('/batch-delete'));
    expect(deleteCall).toBeTruthy();
    expect(JSON.parse((deleteCall![1] as { body: string }).body)).toEqual({ accountIds: ['2'] });
  });

  it('blocks deletion of an account with submitted reviews (per-row failure surfaced)', async () => {
    const list = [
      account({ id: '1', username: 'admin', displayName: '管理員', role: 'ADMIN' }),
      account({ id: '2', username: 'dr.busy', displayName: '忙醫師', role: 'REVIEWER' }),
    ];
    const fetchMock = routeFetch({
      'GET /api/admin/accounts': () => res(list),
      'POST /api/admin/accounts/batch-delete': () =>
        res({ results: [{ accountId: '2', success: false, error: '該帳號已有提交的審查紀錄，請改用「停用」' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(<AccountsListPage />, { account: me, status: 'authenticated' });
    await screen.findByText('dr.busy');
    await userEvent.click(screen.getByLabelText('選取 dr.busy'));
    await userEvent.click(screen.getByRole('button', { name: /批量刪除/ }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: '刪除 1 個帳號' }));

    expect(await screen.findByText(/已有提交的審查紀錄/)).toBeInTheDocument();
  });
});

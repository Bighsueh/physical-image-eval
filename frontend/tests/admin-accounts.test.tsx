import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountCreatePage } from '../src/routes/admin/AccountCreatePage';
import { AccountsListPage } from '../src/routes/admin/AccountsListPage';
import { ForcePasswordChangePage } from '../src/routes/ForcePasswordChangePage';
import { renderWithProviders } from './helpers';

const envelope = (data: unknown, init: { ok?: boolean; status?: number } = {}) => ({
  ok: init.ok ?? true,
  status: init.status ?? 200,
  json: async () => ({ success: init.ok ?? true, data, error: init.ok === false ? data : null }),
});

describe('AccountCreatePage (US2)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('surfaces the one-time temp password after creating an account', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        envelope(
          {
            account: {
              id: '1',
              username: 'dr.lin',
              displayName: '林醫師',
              role: 'REVIEWER',
              isActive: true,
              mustChangePassword: true,
              createdAt: '2026-06-30T00:00:00Z',
            },
            tempPassword: 'Hx7K-2pmQ-9rtX',
          },
          { status: 201 },
        ),
      ),
    );

    renderWithProviders(<AccountCreatePage />);
    await userEvent.type(screen.getByLabelText('顯示名稱'), '林醫師');
    await userEvent.type(screen.getByLabelText('帳號識別碼'), 'dr.lin');
    await userEvent.click(screen.getByRole('button', { name: '建立帳號' }));

    expect(await screen.findByText('Hx7K-2pmQ-9rtX')).toBeInTheDocument();
  });
});

describe('AccountsListPage (US2)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('renders the account rows from the API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        envelope([
          {
            id: '1',
            username: 'dr.lin',
            displayName: '林醫師',
            role: 'REVIEWER',
            isActive: true,
            mustChangePassword: false,
            createdAt: '2026-06-30T00:00:00Z',
          },
        ]),
      ),
    );

    renderWithProviders(<AccountsListPage />);
    expect(await screen.findByText('dr.lin')).toBeInTheDocument();
    expect(screen.getByText('林醫師')).toBeInTheDocument();
    expect(screen.getByText(/在職/)).toBeInTheDocument();
  });
});

describe('ForcePasswordChangePage (US2)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('submits a password change and shows no error', async () => {
    const fetchMock = vi.fn().mockResolvedValue(envelope({ passwordChanged: true }));
    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(<ForcePasswordChangePage />, {
      account: {
        id: '1',
        username: 'admin',
        displayName: '管理員',
        role: 'ADMIN',
        mustChangePassword: true,
      },
      status: 'authenticated',
    });

    await userEvent.type(screen.getByLabelText('目前密碼'), 'old-temp-pass');
    await userEvent.type(screen.getByLabelText('新密碼'), 'A-New-Strong-Pass-9');
    await userEvent.click(screen.getByRole('button', { name: '變更密碼' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/auth/password',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

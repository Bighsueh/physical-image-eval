import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountsListPage } from '../src/routes/admin/AccountsListPage';
import { renderWithProviders } from './helpers';

const reviewerRow = {
  id: 'rev1',
  username: 'dr.lin',
  displayName: '林醫師',
  role: 'REVIEWER',
  isActive: true,
  mustChangePassword: false,
  createdAt: '2026-06-30T00:00:00Z',
};

const env = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ success: true, data, error: null }) });

describe('AccountsListPage actions (US2)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('disables an account (calls the disable endpoint)', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/disable')) return Promise.resolve(env({ ...reviewerRow, isActive: false }));
      return Promise.resolve(env([reviewerRow]));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(<AccountsListPage />);
    await screen.findByText('dr.lin');
    await userEvent.click(screen.getByRole('button', { name: '停用' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/accounts/rev1/disable',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
  });

  it('resets a credential and surfaces the one-time temp password', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/reset-credential'))
        return Promise.resolve(env({ account: reviewerRow, tempPassword: 'NEW-TEMP-PASS' }));
      return Promise.resolve(env([reviewerRow]));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(<AccountsListPage />);
    await screen.findByText('dr.lin');
    await userEvent.click(screen.getByRole('button', { name: '重設密碼' }));

    expect(await screen.findByText('NEW-TEMP-PASS')).toBeInTheDocument();
  });
});

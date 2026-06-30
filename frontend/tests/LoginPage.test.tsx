import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginPage } from '../src/routes/LoginPage';
import { mockEnvelopeFetch, renderWithProviders } from './helpers';

describe('LoginPage (US1)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders zh-TW username + password fields and a submit button', () => {
    renderWithProviders(<LoginPage />);
    expect(screen.getByLabelText('帳號')).toBeInTheDocument();
    expect(screen.getByLabelText('密碼')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '登入' })).toBeInTheDocument();
  });

  it('shows the generic failure message (text, not color-only) on a 401', async () => {
    vi.stubGlobal(
      'fetch',
      mockEnvelopeFetch(
        { success: false, data: null, error: { code: 'AUTH_FAILED', message: '帳號或密碼錯誤' } },
        { ok: false, status: 401 },
      ),
    );
    renderWithProviders(<LoginPage />);
    await userEvent.type(screen.getByLabelText('帳號'), 'dr.lin');
    await userEvent.type(screen.getByLabelText('密碼'), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: '登入' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('帳號或密碼錯誤');
  });

  it('exposes NO registration / signup entry anywhere (US3 cross-check)', () => {
    renderWithProviders(<LoginPage />);
    expect(screen.queryByText(/註冊|建立帳號|申請帳號|signup|register/i)).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });
});

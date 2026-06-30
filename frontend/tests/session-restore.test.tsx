import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '../src/auth/AuthContext';
import { SessionBootstrap } from '../src/auth/SessionBootstrap';
import { LogoutButton } from '../src/components/LogoutButton';

const envelope = (data: unknown, init: { ok?: boolean; status?: number } = {}) => ({
  ok: init.ok ?? true,
  status: init.status ?? 200,
  json: async () => ({ success: init.ok ?? true, data, error: init.ok === false ? data : null }),
});

function Probe() {
  const { status, account } = useAuth();
  return <div>{`status:${status} user:${account?.username ?? 'none'}`}</div>;
}

function bootstrapHarness() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider initialStatus="unknown">
        <MemoryRouter>
          <SessionBootstrap />
          <Probe />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('SessionBootstrap restore (US5/FR-016)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('restores an authenticated session on load', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        envelope({
          account: {
            id: '1',
            username: 'dr.lin',
            displayName: '林醫師',
            role: 'REVIEWER',
            mustChangePassword: false,
          },
        }),
      ),
    );
    bootstrapHarness();
    await waitFor(() => expect(screen.getByText(/status:authenticated/)).toBeInTheDocument());
    expect(screen.getByText(/user:dr\.lin/)).toBeInTheDocument();
  });

  it('resolves to unauthenticated when there is no valid session (401)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        envelope({ code: 'AUTH_REQUIRED', message: '請先登入' }, { ok: false, status: 401 }),
      ),
    );
    bootstrapHarness();
    await waitFor(() => expect(screen.getByText(/status:unauthenticated/)).toBeInTheDocument());
  });
});

describe('LogoutButton (US5/FR-018)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('clears client auth state on logout', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(envelope({ loggedOut: true })));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <AuthProvider
          initialAccount={{
            id: '1',
            username: 'dr.lin',
            displayName: '林醫師',
            role: 'REVIEWER',
            mustChangePassword: false,
          }}
          initialStatus="authenticated"
        >
          <MemoryRouter>
            <LogoutButton />
            <Probe />
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByText(/user:dr\.lin/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '登出' }));
    await waitFor(() => expect(screen.getByText(/status:unauthenticated/)).toBeInTheDocument());
    expect(screen.getByText(/user:none/)).toBeInTheDocument();
  });
});

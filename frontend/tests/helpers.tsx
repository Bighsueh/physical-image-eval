import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider, type AuthStatus } from '../src/auth/AuthContext';
import type { AuthAccount } from '../src/api/auth';

/** Render a component inside Query + Auth + Router providers for component tests. */
export function renderWithProviders(
  ui: ReactNode,
  options: { route?: string; account?: AuthAccount | null; status?: AuthStatus } = {},
): RenderResult {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider
        initialAccount={options.account ?? null}
        initialStatus={options.status ?? (options.account ? 'authenticated' : 'unauthenticated')}
      >
        <MemoryRouter initialEntries={[options.route ?? '/']}>{ui}</MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

/** Build a fetch mock returning a project envelope. */
export function mockEnvelopeFetch(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return vi.fn().mockResolvedValue({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
  });
}

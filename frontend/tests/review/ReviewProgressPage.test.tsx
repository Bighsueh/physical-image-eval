import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthAccount } from '../../src/api/auth';
import { ReviewProgressPage } from '../../src/routes/ReviewProgressPage';
import { renderWithProviders } from '../helpers';

const reviewer: AuthAccount = {
  id: 'r1',
  username: 'dr.lin',
  displayName: '林醫師',
  role: 'REVIEWER',
  mustChangePassword: false,
};

const env = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ success: true, data, error: null }) });

const progress = (index: unknown[]) => ({
  submitted: 1,
  draft: 1,
  notStarted: 38,
  total: 40,
  perRegion: [
    { regionCode: 'S', regionNameZh: '肩部', displayOrder: 1, total: 4, submitted: 1, draft: 0, notStarted: 3 },
    { regionCode: 'K', regionNameZh: '膝部', displayOrder: 6, total: 5, submitted: 0, draft: 1, notStarted: 4 },
  ],
  index,
});
const fullIndex = [
  { blueprintId: 'S1', regionCode: 'S', exerciseName: '五十肩鐘擺', isHighRisk: false, myStatus: '已提交' },
  { blueprintId: 'S4', regionCode: 'S', exerciseName: '肩關節穩定', isHighRisk: true, myStatus: '草稿' },
];

function installFetch(index: unknown[] = fullIndex) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      calls.push(url);
      if (url.includes('/reviews/next')) return env({ next: 'S2', completed: false, submitted: 1, total: 40 });
      return env(progress(index));
    }),
  );
  return calls;
}

describe('ReviewProgressPage (US7)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows counts, per-region, the index with status + high-risk, and a 繼續審查 entry', async () => {
    installFetch();
    renderWithProviders(<ReviewProgressPage />, { account: reviewer });

    expect(await screen.findByText('我的審查進度')).toBeInTheDocument();
    expect(await screen.findByLabelText('審查進度 1 / 40')).toBeInTheDocument(); // wait for data
    expect(screen.getByText('草稿 1')).toBeInTheDocument();
    expect(screen.getAllByText(/肩部/).length).toBeGreaterThan(0);

    const s1 = screen.getByRole('link', { name: /五十肩鐘擺/ });
    expect(s1).toHaveAttribute('href', '/review/S1');
    const s4 = screen.getByRole('link', { name: /肩關節穩定/ });
    expect(within(s4).getByText('高風險')).toBeInTheDocument();
    expect(within(s4).getByText('草稿')).toBeInTheDocument();

    expect(screen.getByRole('link', { name: /繼續審查/ })).toHaveAttribute('href', '/review/S2');
  });

  it('filtering by region issues a scoped request', async () => {
    const calls = installFetch();
    const user = userEvent.setup();
    renderWithProviders(<ReviewProgressPage />, { account: reviewer });
    await screen.findByRole('option', { name: 'K・膝部' }); // wait for data-populated options
    await user.selectOptions(screen.getByLabelText('依區域篩選'), 'K');
    await waitFor(() => expect(calls.some((u) => u.includes('region=K'))).toBe(true));
  });

  it('empty index shows a friendly message, not an error', async () => {
    installFetch([]);
    renderWithProviders(<ReviewProgressPage />, { account: reviewer });
    expect(await screen.findByText('沒有符合條件的圖。')).toBeInTheDocument();
  });
});

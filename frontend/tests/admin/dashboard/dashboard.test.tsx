import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthAccount } from '../../../src/api/auth';
import { DashboardPage } from '../../../src/routes/admin/dashboard/DashboardPage';
import { ImageDrillDownPage } from '../../../src/routes/admin/dashboard/ImageDrillDownPage';
import { ImageFilters } from '../../../src/components/admin/dashboard/ImageFilters';
import { renderWithProviders } from '../../helpers';

const admin: AuthAccount = { id: 'a1', username: 'admin', displayName: '管理員', role: 'ADMIN', mustChangePassword: false };
const env = (data: unknown, meta?: unknown) => ({ ok: true, status: 200, json: async () => ({ success: true, data, error: null, meta }) });

const overview = {
  activeReviewerCount: 3,
  expectedSubmissions: 153,
  submittedActive: 3,
  percent: 2.0,
  inactiveSubmittedTotal: 1,
  fullyCoveredCount: 0,
  blueprintsWithRedoCount: 1,
  highRiskCount: 9,
  totalBlueprints: 51,
};
const reviewers = [
  { accountId: '1', displayName: '甲醫師', isActive: true, submittedCount: 2, total: 51, unreviewedBlueprintIds: ['x'], lastSubmittedBlueprintId: 'S2', lastSubmittedAt: '2026-06-30T05:00:00Z' },
  { accountId: '4', displayName: '前醫師', isActive: false, submittedCount: 1, total: 51, unreviewedBlueprintIds: [], lastSubmittedBlueprintId: 'S1', lastSubmittedAt: '2026-06-20T09:00:00Z' },
];
const images = [
  { blueprintId: 'S1', exerciseName: '五十肩', regionCode: 'S', isHighRisk: false, submittedActiveCount: 2, missingReviewers: [{ accountId: '3', displayName: '丙醫師' }], fullCoverage: false, distribution: { 通過: 1, 需小修: 0, 需重做: 1 }, hasRedo: true, inactiveSubmittedCount: 1 },
  { blueprintId: 'S4', exerciseName: '肩穩定', regionCode: 'S', isHighRisk: true, submittedActiveCount: 0, missingReviewers: [], fullCoverage: false, distribution: { 通過: 0, 需小修: 0, 需重做: 0 }, hasRedo: false, inactiveSubmittedCount: 0 },
];

function installFetch() {
  const calls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    calls.push(url);
    if (url.includes('/dashboard/overview')) return env(overview);
    if (url.includes('/dashboard/reviewers')) return env(reviewers, { total: 2, activeCount: 1, inactiveCount: 1 });
    if (url.includes('/dashboard/images')) return env(images, { total: 51, returned: images.length });
    return env(null);
  }));
  return calls;
}

describe('DashboardPage (US1–US3)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('renders completion summary, image coverage (high-risk + redo + drill link), and reviewers', async () => {
    installFetch();
    renderWithProviders(<DashboardPage />, { account: admin });
    expect(await screen.findByText('整體進度')).toBeInTheDocument();
    expect(await screen.findByText('2%')).toBeInTheDocument(); // active-basis percent
    expect(screen.getByText(/非在職審查者已提交 1 筆/)).toBeInTheDocument();

    // image rows
    const s1 = (await screen.findByText('五十肩')).closest('tr')!;
    expect(within(s1).getByText('需重做')).toBeInTheDocument(); // redo pill
    expect(within(s1).getByRole('link', { name: /逐位明細/ })).toHaveAttribute('href', '/admin/dashboard/images/S1');
    const s4 = screen.getByText('肩穩定').closest('tr')!;
    expect(within(s4).getByText('高風險')).toBeInTheDocument();

    // reviewer rows, 非在職 flagged
    expect(screen.getByText('甲醫師')).toBeInTheDocument();
    expect(screen.getByText('非在職')).toBeInTheDocument();
  });

  it('the filter control drives the query state (含需重做)', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<ImageFilters value={{}} onChange={onChange} />);
    await user.click(screen.getByLabelText('含需重做'));
    expect(onChange).toHaveBeenCalledWith({ hasRedo: true });
    await user.click(screen.getByLabelText('高風險'));
    expect(onChange).toHaveBeenCalledWith({ highRisk: true });
  });

  it('export button downloads the CSV (blob GET)', async () => {
    const calls = installFetch();
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() } as unknown as typeof URL);
    // override fetch for the csv path to return a blob
    const baseFetch = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    baseFetch.mockImplementation(async (url: string) => {
      calls.push(url);
      if (url.includes('reviews.csv')) return { ok: true, blob: async () => new Blob(['csv']) };
      if (url.includes('/overview')) return env(overview);
      if (url.includes('/reviewers')) return env(reviewers, {});
      return env(images, { total: 51, returned: 2 });
    });
    const user = userEvent.setup();
    renderWithProviders(<DashboardPage />, { account: admin });
    await screen.findByText('整體進度');
    await user.click(screen.getByRole('button', { name: /匯出 CSV/ }));
    await waitFor(() => expect(calls.some((u) => u.includes('/admin/export/reviews.csv'))).toBe(true));
  });
});

describe('ImageDrillDownPage (US1 drill-down)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows per-reviewer judgements and surfaces disagreement', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      env({
        blueprintId: 'S1',
        summary: images[0],
        hasDisagreement: true,
        rows: [
          { accountId: '1', displayName: '甲醫師', isActive: true, overallJudgement: '通過', indicationJudgement: '合理', submittedAt: '2026-06-30T05:00:00Z' },
          { accountId: '2', displayName: '乙醫師', isActive: true, overallJudgement: '需重做', indicationJudgement: '有疑慮', submittedAt: '2026-06-30T06:00:00Z' },
        ],
      }),
    ));
    renderWithProviders(
      <Routes>
        <Route path="/admin/dashboard/images/:blueprintId" element={<ImageDrillDownPage />} />
      </Routes>,
      { account: admin, route: '/admin/dashboard/images/S1' },
    );
    expect(await screen.findByText(/S1・五十肩/)).toBeInTheDocument();
    expect(screen.getByText(/存在分歧/)).toBeInTheDocument();
    expect(screen.getByText('甲醫師')).toBeInTheDocument();
    expect(screen.getByText('乙醫師')).toBeInTheDocument();
  });
});

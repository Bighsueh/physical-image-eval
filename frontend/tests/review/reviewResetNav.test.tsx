import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthAccount } from '../../src/api/auth';
import { ReviewWorkspacePage } from '../../src/routes/ReviewWorkspacePage';
import { renderWithProviders } from '../helpers';

const reviewer: AuthAccount = {
  id: 'r1',
  username: 'dr.lin',
  displayName: '林醫師',
  role: 'REVIEWER',
  mustChangePassword: false,
};

const panels = (noProblem = false) =>
  [1, 2, 3, 4].map((i) => ({
    panelIndex: i,
    noProblem,
    requiredWarnings: [],
    warningOther: null,
    problemTypes: [],
    problemNote: null,
  }));

const openData = (over: { review?: Record<string, unknown>; neighbors?: unknown } = {}) => ({
  blueprint: {
    blueprintId: 'S1',
    regionCode: 'S',
    regionNameZh: '肩部',
    exerciseName: '五十肩鐘擺與爬牆運動',
    indications: '肩關節僵硬',
    frequency: '每日 2～3 回',
    gentleReminder: '循序漸進',
    isHighRisk: false,
    imageUrl: '/api/blueprints/S1/image',
    panels: [1, 2, 3, 4].map((i) => ({
      panelIndex: i,
      stepName: `步驟${i}`,
      actionDescription: `動作說明${i}`,
      timingHint: '30 秒',
      visualDescription: `畫面描述${i}`,
    })),
  },
  review: {
    status: '未開始',
    overallJudgement: null,
    indicationJudgement: null,
    indicationNote: null,
    otherComment: null,
    panels: panels(),
    createdAt: null,
    lastSavedAt: null,
    submittedAt: null,
    lastUpdatedAt: null,
    ...(over.review ?? {}),
  },
  progress: { submitted: 0, total: 40 },
  neighbors: over.neighbors ?? { prev: null, next: 'S2' },
});

const env = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ success: true, data, error: null }) });

const renderWorkspace = () =>
  renderWithProviders(
    <Routes>
      <Route path="/review/:blueprintId" element={<ReviewWorkspacePage />} />
    </Routes>,
    { route: '/review/S1', account: reviewer },
  );

describe('ReviewWorkspacePage — reset (初始化本頁提交記錄)', () => {
  beforeEach(() => localStorage.setItem('pie_review_tour_seen_v1', '1'));
  afterEach(() => vi.unstubAllGlobals());

  it('reconfirms, resets the record, clears the form, and does NOT re-create a draft afterwards', async () => {
    const calls: Array<{ url: string; method: string }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, opts: { method?: string } = {}) => {
        const method = opts.method ?? 'GET';
        calls.push({ url, method });
        if (method === 'POST' && url.endsWith('/reset'))
          return env({
            review: {
              status: '未開始',
              overallJudgement: null,
              indicationJudgement: null,
              indicationNote: null,
              otherComment: null,
              panels: panels(),
              createdAt: null,
              lastSavedAt: null,
              submittedAt: null,
              lastUpdatedAt: null,
            },
            progress: { submitted: 0, total: 40 },
          });
        if (method === 'PATCH') return env({ status: '草稿', lastSavedAt: 'x', submittedAt: null, lastUpdatedAt: 'y' });
        return env(openData());
      }),
    );

    const user = userEvent.setup();
    renderWorkspace();
    await screen.findByText(/五十肩/);

    // Make an edit so there is something to reset.
    await user.click(screen.getByRole('radio', { name: /通過/ }));
    expect(screen.getByRole('radio', { name: /通過/ })).toHaveAttribute('aria-checked', 'true');

    // Reset requires a reconfirm dialog.
    await user.click(screen.getByRole('button', { name: '初始化本頁提交記錄' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: '初始化' }));

    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/reset'))).toBe(true));

    // Form is cleared (was the whole point) …
    await waitFor(() => expect(screen.getByRole('radio', { name: /通過/ })).toHaveAttribute('aria-checked', 'false'));

    // … focus returns to the trigger (in-place reset closes the dialog normally, no focus drop to body) …
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '初始化本頁提交記錄' })).toHaveFocus(),
    );

    // … and the blanked editor must NOT autosave an empty draft back to the server (skipNext).
    const patchesAfterReset = calls.filter((c) => c.method === 'PATCH').length;
    await new Promise((r) => setTimeout(r, 1000)); // longer than the 800ms autosave debounce
    expect(calls.filter((c) => c.method === 'PATCH').length).toBe(patchesAfterReset);
  });
});

describe('ReviewWorkspacePage — prev/next navigation', () => {
  beforeEach(() => localStorage.setItem('pie_review_tour_seen_v1', '1'));
  afterEach(() => vi.unstubAllGlobals());

  it('disables 上一張 at the first blueprint and navigates to the next neighbour', async () => {
    const calls: Array<{ url: string; method: string }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, opts: { method?: string } = {}) => {
        calls.push({ url, method: opts.method ?? 'GET' });
        return env(openData({ neighbors: { prev: null, next: 'S2' } }));
      }),
    );

    const user = userEvent.setup();
    renderWorkspace();
    await screen.findByText(/五十肩/);

    expect(screen.getByRole('button', { name: '上一張' })).toBeDisabled(); // first → no prev
    await user.click(screen.getByRole('button', { name: '下一張' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'GET' && c.url.endsWith('/reviews/S2'))).toBe(true));
  });

  it('navigates to the previous neighbour when one exists', async () => {
    const calls: Array<{ url: string; method: string }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, opts: { method?: string } = {}) => {
        calls.push({ url, method: opts.method ?? 'GET' });
        return env(openData({ neighbors: { prev: 'H1', next: 'S2' } }));
      }),
    );

    const user = userEvent.setup();
    renderWorkspace();
    await screen.findByText(/五十肩/);

    await user.click(screen.getByRole('button', { name: '上一張' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'GET' && c.url.endsWith('/reviews/H1'))).toBe(true));
  });
});

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthAccount } from '../../src/api/auth';
import { AuthProvider } from '../../src/auth/AuthContext';
import { ReviewWorkspacePage } from '../../src/routes/ReviewWorkspacePage';

/**
 * Regression: after editing + autosaving a draft, LEAVING and RE-ENTERING the blueprint within the
 * query's stale window used to re-hydrate the reducer from the pre-edit cache, so the saved draft
 * appeared to have vanished. The autosave now syncs the ['review', id] cache, so re-entry restores it
 * WITHOUT a refetch.
 */

const reviewer: AuthAccount = {
  id: 'r1',
  username: 'dr.lin',
  displayName: '林醫師',
  role: 'REVIEWER',
  mustChangePassword: false,
};

const openData = () => ({
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
  // Server always returns the EMPTY template on GET here — the point is that a fresh GET does NOT
  // happen on re-entry (cache is fresh), so restoration must come from the synced cache.
  review: {
    status: '未開始',
    overallJudgement: null,
    indicationJudgement: null,
    indicationNote: null,
    otherComment: null,
    panels: [1, 2, 3, 4].map((i) => ({
      panelIndex: i,
      noProblem: false,
      requiredWarnings: [],
      warningOther: null,
      problemTypes: [],
      problemNote: null,
    })),
    createdAt: null,
    lastSavedAt: null,
    submittedAt: null,
    lastUpdatedAt: null,
  },
  progress: { submitted: 0, total: 51 },
  neighbors: { prev: null, next: 'S2' },
});

const env = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ success: true, data, error: null }) });

describe('ReviewWorkspacePage — draft survives leave + re-entry (stale cache)', () => {
  beforeEach(() => localStorage.setItem('pie_review_tour_seen_v1', '1'));
  afterEach(() => vi.unstubAllGlobals());

  it('restores the autosaved judgement + panel sign-off on re-entry without refetching', async () => {
    const calls: Array<{ url: string; method: string }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, opts: { method?: string } = {}) => {
        const method = opts.method ?? 'GET';
        calls.push({ url, method });
        if (method === 'PATCH') return env({ status: '草稿', lastSavedAt: 'x', submittedAt: null, lastUpdatedAt: 'y' });
        return env(openData());
      }),
    );

    // ONE client shared across both mounts (real behaviour: SPA navigation keeps the cache).
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
    const tree = (
      <QueryClientProvider client={client}>
        <AuthProvider initialAccount={reviewer} initialStatus="authenticated">
          <MemoryRouter initialEntries={['/review/S1']}>
            <Routes>
              <Route path="/review/:blueprintId" element={<ReviewWorkspacePage />} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>
    );

    const user = userEvent.setup();
    const first = render(tree);
    await screen.findByText(/五十肩/);

    // Edit: pick 通過 + sign off all panels → triggers the debounced autosave (PATCH).
    await user.click(screen.getByRole('radio', { name: /通過/ }));
    await user.click(screen.getByRole('button', { name: '全部標示無問題' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true), { timeout: 3000 });

    const getCountAfterSave = calls.filter((c) => c.method === 'GET').length;
    first.unmount();

    // Re-enter the same blueprint (cache still fresh → NO new GET).
    render(tree);
    await screen.findByText(/五十肩/);
    const getCountAfterReentry = calls.filter((c) => c.method === 'GET').length;
    expect(getCountAfterReentry).toBe(getCountAfterSave); // proves it hydrated from cache, not a refetch

    // The saved judgement is restored (was the bug: it came back unselected).
    expect(screen.getByRole('radio', { name: /通過/ })).toHaveAttribute('aria-checked', 'true');
    // And the panel sign-off is restored too.
    expect(screen.getByRole('checkbox', { name: /此分格無問題/ })).toBeChecked();
  });
});

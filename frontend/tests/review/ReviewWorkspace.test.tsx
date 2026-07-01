import { screen, waitFor } from '@testing-library/react';
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

const openData = (over: Record<string, unknown> = {}) => ({
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
    ...((over.blueprint as object) ?? {}),
  },
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

function installFetch(open: Record<string, unknown> = {}) {
  const calls: Array<{ url: string; method: string; body: unknown }> = [];
  const fn = vi.fn(async (url: string, opts: { method?: string; body?: string } = {}) => {
    const method = opts.method ?? 'GET';
    calls.push({ url, method, body: opts.body ? JSON.parse(opts.body) : undefined });
    if (method === 'POST' && url.endsWith('/submit'))
      return env({ status: '已提交', submittedAt: 'x', lastUpdatedAt: 'y', next: 'S2', completed: false, progress: { submitted: 1, total: 51 } });
    if (method === 'PATCH') return env({ status: '草稿', lastSavedAt: 'x', submittedAt: null, lastUpdatedAt: 'y' });
    return env(openData(open)); // any GET /reviews/:id
  });
  vi.stubGlobal('fetch', fn);
  return calls;
}

const renderWorkspace = () =>
  renderWithProviders(
    <Routes>
      <Route path="/review/:blueprintId" element={<ReviewWorkspacePage />} />
    </Routes>,
    { route: '/review/S1', account: reviewer },
  );

describe('ReviewWorkspacePage — Layout A (US1/US2/US4/US6)', () => {
  beforeEach(() => localStorage.setItem('pie_review_tour_seen_v1', '1')); // suppress first-visit auto-tour
  afterEach(() => vi.unstubAllGlobals());

  it('renders the PNG + full read-only metadata + the four-gate form, NO aiPrompt, NO lightbox', async () => {
    installFetch();
    renderWorkspace();
    expect(await screen.findByText(/五十肩鐘擺與爬牆運動/)).toBeInTheDocument();
    expect(screen.getByAltText(/S1 五十肩/)).toBeInTheDocument();
    expect(screen.getByText('肩關節僵硬')).toBeInTheDocument(); // indications
    expect(screen.getByText(/畫面描述1/)).toBeInTheDocument(); // visualDescription shown
    expect(screen.getByRole('radio', { name: /通過/ })).toBeInTheDocument();
    // The four panels collapse into a tab switcher; one panel form is shown at a time.
    expect(screen.getByRole('tab', { name: /圖 1/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /圖 4/ })).toBeInTheDocument();
    expect(screen.getByRole('tabpanel')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull(); // lightbox closed until the image is clicked
    expect(document.body.textContent).not.toContain('aiPrompt');
  });

  it('blocks submit inline (請先選擇整體判定) and does not POST', async () => {
    const calls = installFetch();
    const user = userEvent.setup();
    renderWorkspace();
    await screen.findByText(/五十肩/);
    await user.click(screen.getByRole('button', { name: /提交並前往下一張/ }));
    expect(await screen.findByText('請先選擇整體判定')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST')).toBe(false); // nothing submitted
  });

  it('blocks submit until every panel is addressed, then 全部標示無問題 lets it POST', async () => {
    const calls = installFetch();
    const user = userEvent.setup();
    renderWorkspace();
    await screen.findByText(/五十肩/);
    await user.click(screen.getByRole('radio', { name: /通過/ }));
    // panels unaddressed → blocked with the per-panel message, nothing POSTed
    await user.click(screen.getByRole('button', { name: /提交並前往下一張/ }));
    expect(await screen.findByText('每個分格請勾選「無問題」或標注問題')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
    // sign off all panels → now it submits
    await user.click(screen.getByRole('button', { name: '全部標示無問題' }));
    await user.click(screen.getByRole('button', { name: /提交並前往下一張/ }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/submit'))).toBe(true));
    const submit = calls.find((c) => c.method === 'POST')!;
    const body = submit.body as { overallJudgement: string; panels: { noProblem: boolean }[] };
    expect(body.overallJudgement).toBe('通過');
    expect(body.panels.every((p) => p.noProblem)).toBe(true);
  });

  it('high-risk caution (icon + text) shows only for high-risk blueprints', async () => {
    installFetch({ blueprint: { isHighRisk: true } });
    const { unmount } = renderWorkspace();
    expect(await screen.findAllByText('高風險')).not.toHaveLength(0);
    unmount();
    vi.unstubAllGlobals();

    installFetch({ blueprint: { isHighRisk: false } });
    renderWorkspace();
    await screen.findByText(/五十肩/);
    expect(screen.queryByText('高風險')).toBeNull();
  });
});

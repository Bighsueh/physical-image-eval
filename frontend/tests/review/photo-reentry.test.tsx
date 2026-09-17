import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthAccount } from '../../src/api/auth';
import type { ReviewPhoto } from '../../src/api/review-photos';
import { AuthProvider } from '../../src/auth/AuthContext';
import { useReviewPhotos } from '../../src/hooks/useReviewPhotos';
import { ReviewWorkspacePage } from '../../src/routes/ReviewWorkspacePage';

vi.mock('../../src/lib/prepareImage', async () => {
  const actual = await vi.importActual<typeof import('../../src/lib/prepareImage')>(
    '../../src/lib/prepareImage',
  );
  return {
    ...actual,
    // jsdom has no canvas; the derivative is irrelevant to what these tests prove.
    prepareImage: vi.fn(async (f: File) => ({
      original: new Blob(['o']),
      originalName: f.name,
      display: new Blob(['d']),
    })),
  };
});

/**
 * Regression (prod, 2026-08-28): a reviewer attached a photo to 圖1, left the blueprint (submit
 * auto-advances to the next one), came back — and the photo was gone from the page. It was never
 * gone from the database; the reviewer simply uploaded it again. Three identical rows.
 *
 * Two independent gaps produced that, and both are covered here:
 *   1. `useReviewPhotos` seeded its list once per blueprint and ignored every later server list,
 *      so a background refetch that DID carry the photos changed nothing on screen.
 *   2. Nothing wrote photo mutations into the ['review', id] query cache, so re-entry inside the
 *      30s stale window re-seeded from a payload captured before the upload — an empty list.
 */

const photo = (over: Partial<ReviewPhoto> = {}): ReviewPhoto => ({
  id: 'p1',
  panelIndex: 1,
  caption: null,
  annotated: false,
  sortOrder: 0,
  createdAt: '2026-08-27T00:00:00Z',
  urls: { display: '/d', original: '/o', annotated: null },
  ...over,
});

describe('useReviewPhotos — server list is adopted, not frozen at mount', () => {
  it('shows photos that arrive with a later server payload for the same blueprint', () => {
    const { result, rerender } = renderHook(
      ({ initial }: { initial: ReviewPhoto[] }) => useReviewPhotos('S1', initial),
      { initialProps: { initial: [] as ReviewPhoto[] } },
    );
    expect(result.current.photos).toHaveLength(0);

    // The refetch lands: the server has had this photo all along.
    rerender({ initial: [photo()] });
    expect(result.current.photos.map((p) => p.id)).toEqual(['p1']);
    expect(result.current.countFor(1)).toBe(1);
  });

  it('re-renders with an equal server list do NOT disturb local state', () => {
    const server = [photo()];
    const { result, rerender } = renderHook(
      ({ initial }: { initial: ReviewPhoto[] }) => useReviewPhotos('S1', initial),
      { initialProps: { initial: server } },
    );
    // A fresh array with the same contents on every render must not re-seed (that was the
    // render loop the original ref-based seeding existed to avoid).
    rerender({ initial: [photo()] });
    rerender({ initial: [photo()] });
    expect(result.current.photos.map((p) => p.id)).toEqual(['p1']);
  });

  it('still does not leak one blueprint’s photos into the next', () => {
    const { result, rerender } = renderHook(
      ({ id, initial }: { id: string; initial: ReviewPhoto[] }) => useReviewPhotos(id, initial),
      { initialProps: { id: 'S1', initial: [photo()] } },
    );
    expect(result.current.photos).toHaveLength(1);
    rerender({ id: 'S2', initial: [] });
    expect(result.current.photos).toHaveLength(0);
  });

  it('reports a server-confirmed change so the caller can mirror it into its cache', async () => {
    const onServerChange = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 201,
        json: async () => ({
          success: true,
          data: { photo: photo({ id: 'new' }), reviewStatus: '草稿' },
          error: null,
        }),
      })),
    );
    const { result } = renderHook(() => useReviewPhotos('S1', [], onServerChange));

    act(() => result.current.add([new File(['x'], 'a.jpg', { type: 'image/jpeg' })], 1));
    await waitFor(() => expect(result.current.photos).toHaveLength(1));
    expect(onServerChange).toHaveBeenCalledWith([expect.objectContaining({ id: 'new' })]);
    vi.unstubAllGlobals();
  });
});

const reviewer: AuthAccount = {
  id: 'r1',
  username: 'physical-test',
  displayName: '測試審查者',
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
  // The GET captured BEFORE the upload — exactly what the stale cache holds on re-entry.
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
    photos: [] as ReviewPhoto[],
  },
  progress: { submitted: 0, total: 40 },
  neighbors: { prev: null, next: 'S2' },
});

const env = (data: unknown, status = 200) => ({
  ok: true,
  status,
  json: async () => ({ success: true, data, error: null }),
});

describe('ReviewWorkspacePage — an attached photo survives leave + re-entry (stale cache)', () => {
  beforeEach(() => localStorage.setItem('pie_review_tour_seen_v1', '1'));
  afterEach(() => vi.unstubAllGlobals());

  it('still shows the uploaded photo after re-entering without a refetch', async () => {
    const calls: Array<{ url: string; method: string }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, opts: { method?: string } = {}) => {
        const method = opts.method ?? 'GET';
        calls.push({ url, method });
        if (method === 'POST' && url.includes('/photos')) {
          return env({ photo: photo({ id: 'p1' }), reviewStatus: '草稿' }, 201);
        }
        if (method === 'PATCH') {
          return env({ status: '草稿', lastSavedAt: 'x', submittedAt: null, lastUpdatedAt: 'y' });
        }
        // A refetch would return the photo — the point is that re-entry does NOT refetch.
        return env(openData());
      }),
    );

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
    });
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

    const first = render(tree);
    await screen.findByText(/五十肩/);

    // Attach a photo to 圖1 (the panel field is the first file input on the page).
    const input = first.container.querySelectorAll('input[type=file]')[0] as HTMLInputElement;
    await act(async () => {
      Object.defineProperty(input, 'files', {
        value: [new File(['x'], 'hand.jpg', { type: 'image/jpeg' })],
        configurable: true,
      });
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await screen.findByText('已上傳 1 張');

    const getsBefore = calls.filter((c) => c.method === 'GET').length;
    first.unmount();

    // Re-enter within the stale window — no GET, so the count must come from the synced cache.
    render(tree);
    await screen.findByText(/五十肩/);
    expect(calls.filter((c) => c.method === 'GET').length).toBe(getsBefore);
    expect(screen.getByText('已上傳 1 張')).toBeInTheDocument();
  });
});

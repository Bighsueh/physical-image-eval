import { fireEvent, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyDraft, reviewDraftReducer } from '../../src/state/reviewDraft';
import { useAutosaveReview } from '../../src/hooks/useAutosaveReview';
import { useReviewKeyboard } from '../../src/hooks/useReviewKeyboard';

const env = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ success: true, data, error: null }) });

describe('useAutosaveReview (US3)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('debounces a PATCH on edit and never calls submit', async () => {
    vi.useFakeTimers();
    const calls: Array<{ url: string; method: string }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, opts: { method?: string } = {}) => {
        calls.push({ url, method: opts.method ?? 'GET' });
        return env({ status: '草稿', lastSavedAt: 'x', submittedAt: null, lastUpdatedAt: 'y' });
      }),
    );

    const d1 = emptyDraft();
    const d2 = reviewDraftReducer(d1, { type: 'overall', value: '通過' });
    const { rerender } = renderHook(({ d }) => useAutosaveReview('S1', d, 800), { initialProps: { d: d1 } });

    // first run (just-loaded draft) must not fire
    await vi.advanceTimersByTimeAsync(900);
    expect(calls).toHaveLength(0);

    rerender({ d: d2 });
    await vi.advanceTimersByTimeAsync(900);
    expect(calls.some((c) => c.method === 'PATCH')).toBe(true);
    expect(calls.some((c) => c.url.endsWith('/submit'))).toBe(false);
  });

  it('surfaces an error state when the autosave PATCH fails (never silently idle)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ success: false, data: null, error: { code: 'X', message: 'boom' } }) })));
    const d1 = emptyDraft();
    const d2 = reviewDraftReducer(d1, { type: 'overall', value: '通過' });
    const { result, rerender } = renderHook(({ d }) => useAutosaveReview('S1', d, 10), { initialProps: { d: d1 } });
    rerender({ d: d2 });
    await waitFor(() => expect(result.current).toBe('error')); // real timers + microtask flush
  });
});

describe('useReviewKeyboard (US2 keyboard path)', () => {
  it('maps 1/2/3 to 整體判定 and Cmd/Ctrl+Enter to submit', () => {
    const onJudge = vi.fn();
    const onSubmit = vi.fn();
    renderHook(() => useReviewKeyboard({ onJudge, onSubmit }));

    fireEvent.keyDown(window, { key: '1' });
    expect(onJudge).toHaveBeenCalledWith('通過');
    fireEvent.keyDown(window, { key: '3' });
    expect(onJudge).toHaveBeenCalledWith('需重做');

    fireEvent.keyDown(window, { key: 'Enter', metaKey: true });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('ignores number keys while typing in a field', () => {
    const onJudge = vi.fn();
    renderHook(() => useReviewKeyboard({ onJudge, onSubmit: vi.fn() }));
    const input = document.createElement('input');
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: '1' });
    expect(onJudge).not.toHaveBeenCalled();
    input.remove();
  });

  it('suppresses shortcuts while a modal (e.g. the image lightbox) is open', () => {
    const onJudge = vi.fn();
    const onSubmit = vi.fn();
    renderHook(() => useReviewKeyboard({ onJudge, onSubmit }));
    const modal = document.createElement('div');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    document.body.appendChild(modal);
    fireEvent.keyDown(window, { key: '2' });
    fireEvent.keyDown(window, { key: 'Enter', metaKey: true });
    expect(onJudge).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
    modal.remove();
  });
});

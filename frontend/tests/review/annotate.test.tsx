import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReviewPhoto } from '../../src/api/review-photos';

vi.mock('../../src/api/review-photos', async () => {
  const actual = await vi.importActual<typeof import('../../src/api/review-photos')>(
    '../../src/api/review-photos',
  );
  return { ...actual, getAnnotation: vi.fn(), saveAnnotation: vi.fn() };
});

import { getAnnotation, saveAnnotation } from '../../src/api/review-photos';
import { AnnotateEditor } from '../../src/features/annotate/AnnotateEditor';
import { FILEROBOT_ZH_TW } from '../../src/features/annotate/filerobot-zh-TW';

const photo: ReviewPhoto = {
  id: 'p1',
  panelIndex: 1,
  caption: null,
  annotated: false,
  sortOrder: 0,
  createdAt: '2026-08-27T00:00:00Z',
  urls: { display: '/display.jpg', original: '/original.jpg', annotated: null },
};

beforeEach(() => {
  vi.mocked(getAnnotation).mockResolvedValue({ annotationState: null });
  // dataUrlToBlob goes through fetch(dataUrl).
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ blob: async () => new Blob(['png']) } as unknown as Response),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const setup = () => {
  const onSaved = vi.fn();
  const onClose = vi.fn();
  render(<AnnotateEditor blueprintId="E3" photo={photo} onClose={onClose} onSaved={onSaved} />);
  return { onSaved, onClose };
};

describe('AnnotateEditor — our side of the editor boundary', () => {
  it('loads the ORIGINAL, not the display derivative, so output is full resolution', async () => {
    setup();
    const stub = await screen.findByTestId('filerobot-stub');
    expect(stub).toHaveAttribute('data-source', '/original.jpg');
  });

  it('keeps translations local — the vendor lookup would be outbound traffic (FR-055)', async () => {
    setup();
    const stub = await screen.findByTestId('filerobot-stub');
    expect(stub).toHaveAttribute('data-backend-translations', 'false');
    // And the map we ship is real, not a stub of a few keys.
    expect(Object.keys(FILEROBOT_ZH_TW).length).toBeGreaterThan(40);
    expect(FILEROBOT_ZH_TW.save).toBe('儲存標註');
    expect(FILEROBOT_ZH_TW.arrowTool).toBe('箭頭');
  });

  it('separates preview resolution from save resolution', async () => {
    setup();
    const stub = await screen.findByTestId('filerobot-stub');
    expect(Number(stub.getAttribute('data-preview-ratio'))).toBeLessThan(
      Number(stub.getAttribute('data-saving-ratio')),
    );
  });

  it('restores a previous annotation so it can be edited, not just replaced', async () => {
    vi.mocked(getAnnotation).mockResolvedValue({ annotationState: { arrow: 'kept' } });
    setup();
    const stub = await screen.findByTestId('filerobot-stub');
    expect(JSON.parse(stub.getAttribute('data-loaded-state')!)).toEqual({ arrow: 'kept' });
  });

  it('still opens when the previous state cannot be fetched', async () => {
    vi.mocked(getAnnotation).mockRejectedValue(new Error('offline'));
    setup();
    expect(await screen.findByTestId('filerobot-stub')).toBeInTheDocument();
  });

  it('saves the flattened image and the design state, then hands the photo back', async () => {
    vi.mocked(saveAnnotation).mockResolvedValue({ photo: { ...photo, annotated: true } });
    const { onSaved } = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'stub-save' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const [blueprintId, photoId, blob, state] = vi.mocked(saveAnnotation).mock.calls[0];
    expect(blueprintId).toBe('E3');
    expect(photoId).toBe('p1');
    expect(blob).toBeInstanceOf(Blob);
    expect(state).toEqual({ arrow: 1 });
    expect(onSaved.mock.calls[0][0].annotated).toBe(true);
  });

  it('degrades the export resolution instead of losing the annotation', async () => {
    vi.mocked(saveAnnotation).mockRejectedValueOnce(new Error('out of memory'));
    const { onSaved } = setup();
    const stub = await screen.findByTestId('filerobot-stub');
    const fullRatio = Number(stub.getAttribute('data-saving-ratio'));

    await userEvent.click(screen.getByRole('button', { name: 'stub-save' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/無法輸出原尺寸/));
    expect(screen.getByRole('alert')).toHaveTextContent(/標註內容不會遺失/);
    expect(Number(screen.getByTestId('filerobot-stub').getAttribute('data-saving-ratio'))).toBeLessThan(
      fullRatio,
    );
    expect(onSaved).not.toHaveBeenCalled();

    // A second failure at the reduced ratio reports plainly rather than degrading forever.
    vi.mocked(saveAnnotation).mockRejectedValueOnce(new Error('still failing'));
    await userEvent.click(screen.getByRole('button', { name: 'stub-save' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/儲存失敗/));
  });

  it('closes without saving', async () => {
    const { onClose, onSaved } = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'stub-close' }));
    expect(onClose).toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });
});

describe('AnnotateModal — the lazy boundary', () => {
  it('shows a zh-TW loading state while the editor chunk is fetched, then renders it', async () => {
    const { AnnotateModal } = await import('../../src/features/annotate/AnnotateModal.lazy');
    const onSaved = vi.fn();
    const onClose = vi.fn();
    render(<AnnotateModal blueprintId="E3" photo={photo} onClose={onClose} onSaved={onSaved} />);

    // Suspense fallback first — the editor is not part of the main bundle (research D17).
    expect(screen.getByRole('status')).toHaveTextContent(/標註工具載入中|載入先前的標註/);
    expect(await screen.findByTestId('filerobot-stub')).toBeInTheDocument();
  });
});

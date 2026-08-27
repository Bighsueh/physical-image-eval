import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReviewPhoto } from '../../src/api/review-photos';
import { useReviewPhotos } from '../../src/hooks/useReviewPhotos';

vi.mock('../../src/api/review-photos', async () => {
  const actual = await vi.importActual<typeof import('../../src/api/review-photos')>(
    '../../src/api/review-photos',
  );
  return {
    ...actual,
    uploadPhoto: vi.fn(),
    deletePhoto: vi.fn(),
    updatePhotoCaption: vi.fn(),
  };
});
vi.mock('../../src/lib/prepareImage', async () => {
  const actual = await vi.importActual<typeof import('../../src/lib/prepareImage')>(
    '../../src/lib/prepareImage',
  );
  return { ...actual, prepareImage: vi.fn() };
});

import { PhotoApiError, deletePhoto, updatePhotoCaption, uploadPhoto } from '../../src/api/review-photos';
import { UnsupportedImageError, prepareImage } from '../../src/lib/prepareImage';

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

const file = (name = 'a.jpg') => new File(['x'], name, { type: 'image/jpeg' });

beforeEach(() => {
  vi.mocked(prepareImage).mockResolvedValue({
    original: new Blob(['o']),
    originalName: 'a.jpg',
    display: new Blob(['d']),
  });
});
afterEach(() => vi.clearAllMocks());

describe('useReviewPhotos', () => {
  it('adds an uploaded photo and clears its pending entry', async () => {
    vi.mocked(uploadPhoto).mockResolvedValue({ photo: photo(), reviewStatus: '草稿' });
    const { result } = renderHook(() => useReviewPhotos('E3', []));

    act(() => result.current.add([file()], 1));
    await waitFor(() => expect(result.current.photos).toHaveLength(1));
    expect(result.current.pending).toHaveLength(0);
    expect(result.current.countFor(1)).toBe(1);
    expect(result.current.countFor(2)).toBe(0);
    expect(result.current.countFor(null)).toBe(0);
  });

  it('keeps one failure from taking its siblings down (FR-058)', async () => {
    vi.mocked(uploadPhoto)
      .mockResolvedValueOnce({ photo: photo({ id: 'ok1' }), reviewStatus: '草稿' })
      .mockRejectedValueOnce(new PhotoApiError('UNKNOWN', '上傳失敗', 500))
      .mockResolvedValueOnce({ photo: photo({ id: 'ok2' }), reviewStatus: '草稿' });

    const { result } = renderHook(() => useReviewPhotos('E3', []));
    act(() => result.current.add([file('a.jpg'), file('b.jpg'), file('c.jpg')], 1));

    await waitFor(() => expect(result.current.photos).toHaveLength(2));
    expect(result.current.pending).toHaveLength(1);
    expect(result.current.pending[0].phase).toBe('error');
    expect(result.current.pending[0].message).toBe('上傳失敗');
  });

  it('flags the storage ceiling so the UI can stop offering uploads', async () => {
    vi.mocked(uploadPhoto).mockRejectedValue(
      new PhotoApiError('PHOTO_STORAGE_FULL', '照片儲存空間已滿，請聯絡管理員', 409),
    );
    const { result } = renderHook(() => useReviewPhotos('E3', []));
    act(() => result.current.add([file()], 1));

    await waitFor(() => expect(result.current.storageFull).toBe(true));
    expect(result.current.pending[0].storageFull).toBe(true);
  });

  it('surfaces an undecodable file with its own message, not a generic one', async () => {
    vi.mocked(prepareImage).mockRejectedValue(new UnsupportedImageError());
    const { result } = renderHook(() => useReviewPhotos('E3', []));
    act(() => result.current.add([file('x.tiff')], 1));

    await waitFor(() => expect(result.current.pending[0]?.phase).toBe('error'));
    expect(result.current.pending[0].message).toMatch(/無法讀取為圖片/);
  });

  it('retries a failed upload in place, keeping its position', async () => {
    vi.mocked(uploadPhoto)
      .mockRejectedValueOnce(new PhotoApiError('UNKNOWN', '上傳失敗', 500))
      .mockResolvedValueOnce({ photo: photo(), reviewStatus: '草稿' });

    const { result } = renderHook(() => useReviewPhotos('E3', []));
    act(() => result.current.add([file()], 1));
    await waitFor(() => expect(result.current.pending[0]?.phase).toBe('error'));

    act(() => result.current.retry(result.current.pending[0].key));
    await waitFor(() => expect(result.current.photos).toHaveLength(1));
    expect(result.current.storageFull).toBe(false);
  });

  it('dismisses a failure without retrying it', async () => {
    vi.mocked(uploadPhoto).mockRejectedValue(new PhotoApiError('UNKNOWN', '上傳失敗', 500));
    const { result } = renderHook(() => useReviewPhotos('E3', []));
    act(() => result.current.add([file()], 1));
    await waitFor(() => expect(result.current.pending).toHaveLength(1));

    act(() => result.current.dismiss(result.current.pending[0].key));
    expect(result.current.pending).toHaveLength(0);
  });

  it('removes and re-captions through the API, keeping local state in step', async () => {
    vi.mocked(deletePhoto).mockResolvedValue({ deleted: true });
    vi.mocked(updatePhotoCaption).mockResolvedValue({ photo: photo({ caption: '新說明' }) });

    const { result } = renderHook(() => useReviewPhotos('E3', [photo()]));
    await act(() => result.current.setCaption('p1', '新說明'));
    expect(result.current.photos[0].caption).toBe('新說明');
    expect(updatePhotoCaption).toHaveBeenCalledWith('E3', 'p1', '新說明');

    await act(() => result.current.remove('p1'));
    expect(result.current.photos).toHaveLength(0);
  });

  it('replaces a photo after an annotation round-trip', () => {
    const { result } = renderHook(() => useReviewPhotos('E3', [photo()]));
    act(() =>
      result.current.replace(photo({ annotated: true, urls: { display: '/d', original: '/o', annotated: '/a' } })),
    );
    expect(result.current.photos[0].annotated).toBe(true);
  });

  it('resets when the blueprint changes, and does NOT loop on a fresh initial array', async () => {
    vi.mocked(uploadPhoto).mockResolvedValue({ photo: photo(), reviewStatus: '草稿' });
    let renders = 0;
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => {
        renders += 1;
        // A NEW array each render — the shape the workspace passes (`data.review.photos ?? []`).
        return useReviewPhotos(id, []);
      },
      { initialProps: { id: 'E3' } },
    );

    act(() => result.current.add([file()], 1));
    await waitFor(() => expect(result.current.photos).toHaveLength(1));

    const before = renders;
    rerender({ id: 'E3' });
    // One render for the rerender itself. Any more means the effect is re-seeding state on
    // every render — the infinite loop this guards against.
    expect(renders).toBe(before + 1);
    expect(result.current.photos).toHaveLength(1);

    rerender({ id: 'E5' });
    await waitFor(() => expect(result.current.photos).toHaveLength(0));
  });
});

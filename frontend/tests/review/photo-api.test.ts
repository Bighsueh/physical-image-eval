import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PhotoApiError,
  deletePhoto,
  getAnnotation,
  saveAnnotation,
  updatePhotoCaption,
  uploadPhoto,
} from '../../src/api/review-photos';

/**
 * The photo API is the only multipart surface in the app, so it reproduces the envelope and
 * CSRF handling rather than going through `apiFetch`. These tests pin the parts that would
 * silently break: the field names the server expects, the CSRF header, and the error code
 * surviving so the UI can branch on it.
 */
const envelope = (data: unknown) =>
  ({ ok: true, json: async () => ({ success: true, data, error: null }) }) as unknown as Response;

const failure = (code: string, message: string, status = 400) =>
  ({
    ok: false,
    status,
    json: async () => ({ success: false, data: null, error: { code, message } }),
  }) as unknown as Response;

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  document.cookie = 'pie_csrf=tok123';
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.cookie = 'pie_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
});

const blob = (s = 'x') => new Blob([s], { type: 'image/jpeg' });

describe('uploadPhoto', () => {
  it('sends original + display as multipart with the CSRF header', async () => {
    fetchMock.mockResolvedValue(envelope({ photo: { id: 'p1' }, reviewStatus: '草稿' }));
    const res = await uploadPhoto('E3', {
      original: blob('orig'),
      originalName: 'hand.heic',
      display: blob('disp'),
      panelIndex: 2,
      caption: '正確角度',
    });

    expect(res.reviewStatus).toBe('草稿');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/reviews/E3/photos');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(init.headers['X-CSRF-Token']).toBe('tok123');

    const form = init.body as FormData;
    expect((form.get('original') as File).name).toBe('hand.heic');
    expect(form.get('display')).toBeInstanceOf(Blob);
    expect(form.get('panelIndex')).toBe('2');
    expect(form.get('caption')).toBe('正確角度');
    expect(form.get('originalAsJpeg')).toBeNull();
  });

  it('omits panelIndex for an image-level photo and includes the HEIC stand-in when given', async () => {
    fetchMock.mockResolvedValue(envelope({ photo: { id: 'p1' }, reviewStatus: '草稿' }));
    await uploadPhoto('E3', {
      original: blob(),
      originalName: 'a.heic',
      display: blob(),
      originalAsJpeg: blob('full'),
      panelIndex: null,
    });
    const form = fetchMock.mock.calls[0][1].body as FormData;
    expect(form.get('panelIndex')).toBeNull();
    expect(form.get('originalAsJpeg')).toBeInstanceOf(Blob);
  });

  it('preserves the error code so the UI can tell "full" from "unsupported"', async () => {
    fetchMock.mockResolvedValue(failure('PHOTO_STORAGE_FULL', '照片儲存空間已滿，請聯絡管理員', 409));
    await expect(
      uploadPhoto('E3', { original: blob(), originalName: 'a.jpg', display: blob() }),
    ).rejects.toMatchObject({ code: 'PHOTO_STORAGE_FULL', status: 409 });
  });

  it('falls back to a usable zh-TW message when the response is not an envelope', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error('not json');
      },
    } as unknown as Response);
    await expect(
      uploadPhoto('E3', { original: blob(), originalName: 'a.jpg', display: blob() }),
    ).rejects.toBeInstanceOf(PhotoApiError);
  });
});

describe('saveAnnotation', () => {
  it('PUTs the flattened image and the design state as JSON', async () => {
    fetchMock.mockResolvedValue(envelope({ photo: { id: 'p1' } }));
    await saveAnnotation('E3', 'p1', blob('png'), { annotations: { a: 1 } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/reviews/E3/photos/p1/annotation');
    expect(init.method).toBe('PUT');
    const form = init.body as FormData;
    expect(form.get('annotated')).toBeInstanceOf(Blob);
    expect(JSON.parse(form.get('annotationState') as string)).toEqual({ annotations: { a: 1 } });
  });
});

describe('the JSON endpoints go through the shared client', () => {
  beforeEach(() => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { deleted: true, photo: { id: 'p1' }, annotationState: null }, error: null }),
    } as unknown as Response);
  });

  it('deletes, patches a caption, and reads annotation state', async () => {
    await deletePhoto('E3', 'p1');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/reviews/E3/photos/p1');
    expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');

    await updatePhotoCaption('E3', 'p1', '新說明');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ caption: '新說明' });

    await getAnnotation('E3', 'p1');
    expect(fetchMock.mock.calls[2][0]).toBe('/api/reviews/E3/photos/p1/annotation');
  });

  it('normalizes an emptied caption to null rather than an empty string', async () => {
    await updatePhotoCaption('E3', 'p1', '');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ caption: null });
  });
});

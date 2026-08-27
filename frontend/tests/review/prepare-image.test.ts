import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DISPLAY_MAX_EDGE,
  UnsupportedImageError,
  prepareImage,
} from '../../src/lib/prepareImage';

/**
 * The browser is where decoding and downscaling happen, which is what lets the backend ship
 * with no image library at all. jsdom has neither `createImageBitmap` nor a real canvas, so
 * both are stubbed — what these tests pin is the contract: the original is forwarded UNTOUCHED,
 * a display derivative is produced, and HEIC additionally gets a full-size JPEG stand-in.
 */
const drawn: { w: number; h: number }[] = [];
let toBlobResult: Blob | null = new Blob(['jpeg'], { type: 'image/jpeg' });

const makeBitmap = (width: number, height: number) => ({
  width,
  height,
  close: vi.fn(),
});

beforeEach(() => {
  drawn.length = 0;
  toBlobResult = new Blob(['jpeg'], { type: 'image/jpeg' });

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: (_img: unknown, _x: number, _y: number, w: number, h: number) => {
      drawn.push({ w, h });
    },
  } as unknown as CanvasRenderingContext2D);

  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
    this: HTMLCanvasElement,
    cb: BlobCallback,
  ) {
    cb(toBlobResult);
  } as HTMLCanvasElement['toBlob']);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const file = (name: string, type = 'image/jpeg') => new File(['bytes'], name, { type });

describe('prepareImage', () => {
  it('forwards the original untouched and downscales only the display copy (FR-052)', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(makeBitmap(4000, 3000)));
    const input = file('hand.jpg');
    const out = await prepareImage(input);

    expect(out.original).toBe(input); // the very same File object — never re-encoded
    expect(out.originalName).toBe('hand.jpg');
    expect(out.display).toBeInstanceOf(Blob);
    expect(out.originalAsJpeg).toBeUndefined();

    // Long edge clamped to the display bound, aspect preserved.
    expect(drawn[0].w).toBe(DISPLAY_MAX_EDGE);
    expect(drawn[0].h).toBe(Math.round((3000 / 4000) * DISPLAY_MAX_EDGE));
  });

  it('never upscales an image that is already small', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(makeBitmap(400, 200)));
    await prepareImage(file('small.jpg'));
    expect(drawn[0]).toEqual({ w: 400, h: 200 });
  });

  it('adds a full-size JPEG for a HEIC original so a bundle is always openable', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(makeBitmap(4032, 3024)));
    const out = await prepareImage(file('IMG_0001.HEIC', 'image/heic'));
    expect(out.originalAsJpeg).toBeInstanceOf(Blob);
    // Two draws: the display copy, then the full-size stand-in at native dimensions.
    expect(drawn).toHaveLength(2);
    expect(drawn[1]).toEqual({ w: 4032, h: 3024 });
  });

  it('recognizes HEIC by extension when the browser reports no type', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(makeBitmap(100, 100)));
    const out = await prepareImage(file('photo.heif', ''));
    expect(out.originalAsJpeg).toBeInstanceOf(Blob);
  });

  it('falls back to the lazily-loaded WASM decoder when the browser cannot decode', async () => {
    const native = vi
      .fn()
      .mockRejectedValueOnce(new Error('unsupported'))
      .mockResolvedValueOnce(makeBitmap(120, 90));
    vi.stubGlobal('createImageBitmap', native);

    // The stubbed decoder throws — proving the fallback path is the one being taken, and that
    // its failure surfaces as an undecodable file rather than an opaque crash.
    await expect(prepareImage(file('IMG.HEIC', 'image/heic'))).rejects.toBeInstanceOf(
      UnsupportedImageError,
    );
    expect(native).toHaveBeenCalled();
  });

  it('reports an undecodable file with copy a clinician can act on', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('nope')));
    await expect(prepareImage(file('notes.txt', 'text/plain'))).rejects.toThrow(/JPG／PNG/);
  });

  it('treats a canvas that cannot produce a blob as an unsupported image', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(makeBitmap(100, 100)));
    toBlobResult = null;
    await expect(prepareImage(file('a.jpg'))).rejects.toBeInstanceOf(UnsupportedImageError);
  });

  it('releases the decoded bitmap even when encoding fails', async () => {
    const bitmap = makeBitmap(100, 100);
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
    toBlobResult = null;
    await expect(prepareImage(file('a.jpg'))).rejects.toBeTruthy();
    expect(bitmap.close).toHaveBeenCalled();
  });
});

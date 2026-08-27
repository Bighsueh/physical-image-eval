/**
 * Turns a file the reviewer picked into what the server stores (research D13/D16).
 *
 * Two things happen here and nowhere else:
 *
 *  1. **The original is never modified.** It is forwarded as-is — the whole point of FR-052 is
 *     that the material you repair images from is the real photo, not a shrunken copy.
 *  2. **A display derivative is produced in the browser.** Doing it here rather than on the
 *     server is what lets the backend ship with no image library at all: `sharp`'s prebuilt
 *     binaries exclude HEIC (patent licensing), so server-side support would mean compiling
 *     libvips from source.
 *
 * HEIC decoding rides on the same canvas pass: Safari decodes it natively and quickly, and
 * browsers that cannot (notably desktop Chrome) fall back to a WASM decoder that is only
 * downloaded when such a file is actually picked.
 */
export const DISPLAY_MAX_EDGE = 1600;
export const DISPLAY_QUALITY = 0.82;

export interface PreparedImage {
  original: Blob;
  originalName: string;
  display: Blob;
  /** Present only when the original is HEIC — see the bundle rule in 004. */
  originalAsJpeg?: Blob;
}

export class UnsupportedImageError extends Error {
  constructor() {
    super('這個檔案無法讀取為圖片，請改用 JPG／PNG 格式');
    this.name = 'UnsupportedImageError';
  }
}

const isHeic = (file: File): boolean =>
  /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);

/** Decode to a bitmap, falling back to the lazily-loaded WASM decoder for HEIC on browsers
 * that cannot do it natively. */
async function decode(file: File | Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file);
  } catch {
    const { decodeHeicToBlob } = await import('./heicDecode.lazy');
    const jpeg = await decodeHeicToBlob(file);
    return createImageBitmap(jpeg);
  }
}

function drawScaled(bitmap: ImageBitmap, maxEdge: number): HTMLCanvasElement {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new UnsupportedImageError();
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

const toJpeg = (canvas: HTMLCanvasElement, quality: number): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new UnsupportedImageError())),
      'image/jpeg',
      quality,
    );
  });

export async function prepareImage(file: File): Promise<PreparedImage> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await decode(file);
  } catch {
    throw new UnsupportedImageError();
  }

  try {
    const display = await toJpeg(drawScaled(bitmap, DISPLAY_MAX_EDGE), DISPLAY_QUALITY);
    const prepared: PreparedImage = { original: file, originalName: file.name, display };

    // A HEIC original is unopenable in most desktop tools, so a full-size JPEG rides along to
    // guarantee the admin bundle always contains something usable. JPEG/PNG/WebP originals are
    // already universal and pay nothing.
    if (isHeic(file)) {
      prepared.originalAsJpeg = await toJpeg(
        drawScaled(bitmap, Math.max(bitmap.width, bitmap.height)),
        0.92,
      );
    }
    return prepared;
  } finally {
    bitmap.close?.();
  }
}

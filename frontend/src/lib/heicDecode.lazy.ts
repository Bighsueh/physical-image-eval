/**
 * HEIC decoding for browsers that cannot do it natively.
 *
 * Loaded through a dynamic import so the WASM decoder is fetched only when someone actually
 * picks a `.heic` file. On iOS Safari this module is never loaded at all — the platform
 * decodes HEIC itself, an order of magnitude faster than any JS/WASM path.
 *
 * The decoder itself is resolved at call time and kept behind this single function, so
 * swapping it (or dropping it, once every target browser decodes HEIC) touches one file.
 */
export async function decodeHeicToBlob(file: File | Blob): Promise<Blob> {
  const buffer = await file.arrayBuffer();
  const { default: decode } = await import('heic-decode');
  const { width, height, data } = await decode({ buffer });
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');
  // ImageData wants a Uint8ClampedArray over a plain ArrayBuffer; the decoder's view may be
  // over a pooled one, so copy into a fresh array rather than fight the type.
  const pixels = new Uint8ClampedArray(data.length);
  pixels.set(data);
  ctx.putImageData(new ImageData(pixels, width, height), 0, 0);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('HEIC re-encode failed'))),
      'image/jpeg',
      0.92,
    );
  });
}

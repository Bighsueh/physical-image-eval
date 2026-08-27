import { AppError } from '../../../lib/errors';

/**
 * Image type detection by magic bytes (research D16).
 *
 * The client's `Content-Type` is never consulted: it is attacker-controlled, and a file
 * renamed `.png` proves nothing about its contents (constitution V — validate every boundary
 * against a fixed allow-list).
 *
 * The two allow-lists differ on purpose. The **original** is whatever the reviewer's phone
 * produced and must be kept byte-for-byte (FR-052), so HEIC is admitted. The **display** and
 * **annotated** variants are produced by our own client code, so anything other than the
 * three web formats indicates a client that is not ours.
 */
export type ImageMimeType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heic';
export type PhotoVariant = 'original' | 'display' | 'annotated';

export const ORIGINAL_ACCEPTED: readonly ImageMimeType[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
];
export const DERIVATIVE_ACCEPTED: readonly ImageMimeType[] = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Each signature declares its own length. A blanket minimum would misclassify a valid but
 * short buffer — a JPEG is identifiable from three bytes, so demanding twelve would report
 * `null` for something perfectly recognizable.
 */
const startsWith = (buf: Buffer, bytes: readonly number[]): boolean =>
  buf.length >= bytes.length && bytes.every((b, i) => buf[i] === b);

/**
 * Returns the detected type, or null when the bytes match no supported format. Never throws —
 * callers decide what an unrecognized buffer means for their variant.
 */
export function detectImageType(buf: Buffer): ImageMimeType | null {
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  // RIFF....WEBP — the size field between the two markers is not part of the signature.
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  // ISO-BMFF: a 4-byte box size, then 'ftyp', then a brand. HEIC brands vary by encoder.
  if (buf.length >= 12 && buf.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buf.toString('ascii', 8, 12);
    if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1', 'heim', 'heis'].includes(brand)) {
      return 'image/heic';
    }
  }
  return null;
}

/**
 * Throws `UNSUPPORTED_IMAGE_TYPE` unless the bytes are an image this variant admits.
 * Returns the detected type so the caller can store it (never the declared one).
 */
export function assertVariantAccepted(variant: PhotoVariant, buf: Buffer): ImageMimeType {
  const detected = detectImageType(buf);
  const accepted = variant === 'original' ? ORIGINAL_ACCEPTED : DERIVATIVE_ACCEPTED;
  if (detected === null || !accepted.includes(detected)) {
    throw new AppError('UNSUPPORTED_IMAGE_TYPE');
  }
  return detected;
}

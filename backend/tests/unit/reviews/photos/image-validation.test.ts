import { describe, expect, it } from 'vitest';
import {
  detectImageType,
  assertVariantAccepted,
  ORIGINAL_ACCEPTED,
  DERIVATIVE_ACCEPTED,
} from '../../../../src/reviews/photos/services/image-validation';
import { AppError } from '../../../../src/lib/errors';

/** Minimal real headers — enough bytes for a sniffer, not real images. */
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF'), Buffer.from([0x24, 0x00, 0x00, 0x00]), Buffer.from('WEBPVP8 '),
]);
const HEIC = Buffer.concat([
  Buffer.from([0x00, 0x00, 0x00, 0x18]), Buffer.from('ftypheic'), Buffer.from('mif1heic'),
]);
const NOT_AN_IMAGE = Buffer.from('#!/bin/sh\nrm -rf /\n');

describe('detectImageType — magic bytes, never the declared header (research D16)', () => {
  it('identifies each supported format from its bytes', () => {
    expect(detectImageType(JPEG)).toBe('image/jpeg');
    expect(detectImageType(PNG)).toBe('image/png');
    expect(detectImageType(WEBP)).toBe('image/webp');
    expect(detectImageType(HEIC)).toBe('image/heic');
  });

  it('classifies by content, so a renamed or mislabelled file cannot smuggle a type', () => {
    // The file claims to be a PNG; the bytes say JPEG. Bytes win.
    expect(detectImageType(JPEG)).toBe('image/jpeg');
    expect(detectImageType(NOT_AN_IMAGE)).toBeNull();
    expect(detectImageType(Buffer.alloc(0))).toBeNull();
    expect(detectImageType(Buffer.from([0xff, 0xd8]))).toBeNull(); // truncated below sniff length
  });
});

describe('assertVariantAccepted — the original accepts HEIC, derivatives do not', () => {
  it('accepts HEIC as an original (FR-052 keeps whatever the phone produced)', () => {
    expect(ORIGINAL_ACCEPTED).toContain('image/heic');
    expect(() => assertVariantAccepted('original', HEIC)).not.toThrow();
  });

  it('rejects HEIC as a display or annotated derivative — those are produced by us', () => {
    expect(DERIVATIVE_ACCEPTED).not.toContain('image/heic');
    for (const variant of ['display', 'annotated'] as const) {
      expect(() => assertVariantAccepted(variant, HEIC)).toThrowError(AppError);
      try {
        assertVariantAccepted(variant, HEIC);
      } catch (err) {
        expect((err as AppError).code).toBe('UNSUPPORTED_IMAGE_TYPE');
      }
    }
  });

  it('rejects non-image bytes for every variant', () => {
    for (const variant of ['original', 'display', 'annotated'] as const) {
      expect(() => assertVariantAccepted(variant, NOT_AN_IMAGE)).toThrowError(AppError);
    }
  });

  it('accepts jpeg/png/webp for every variant', () => {
    for (const variant of ['original', 'display', 'annotated'] as const) {
      for (const buf of [JPEG, PNG, WEBP]) {
        expect(() => assertVariantAccepted(variant, buf)).not.toThrow();
      }
    }
  });
});

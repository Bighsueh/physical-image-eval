import { describe, expect, it } from 'vitest';
import {
  photoCaptionSchema,
  photoUploadFieldsSchema,
  photoVariantSchema,
} from '../../../../src/reviews/photos/validation/review-photo.schema';

describe('photoUploadFieldsSchema — panelIndex is optional and bounded', () => {
  it('accepts 1..4 and omission (image-level, FR-045/FR-046)', () => {
    for (const panelIndex of ['1', '2', '3', '4']) {
      expect(photoUploadFieldsSchema.parse({ panelIndex }).panelIndex).toBe(Number(panelIndex));
    }
    expect(photoUploadFieldsSchema.parse({}).panelIndex).toBeNull();
    expect(photoUploadFieldsSchema.parse({ panelIndex: '' }).panelIndex).toBeNull();
  });

  it('rejects out-of-range and non-integer panels', () => {
    for (const bad of ['0', '5', '-1', '1.5', 'abc']) {
      expect(() => photoUploadFieldsSchema.parse({ panelIndex: bad })).toThrow();
    }
  });

  it('strips unknown fields so a client cannot set server-owned columns', () => {
    const parsed = photoUploadFieldsSchema.parse({
      panelIndex: '2',
      sortOrder: '99',
      originalByteSize: '1',
      reviewId: 'somebody-elses-review',
    }) as Record<string, unknown>;
    expect(parsed.reviewId).toBeUndefined();
    expect(parsed.originalByteSize).toBeUndefined();
  });
});

describe('photoCaptionSchema — optional free text, length-capped (FR-047)', () => {
  it('accepts empty, null and normal text', () => {
    expect(photoCaptionSchema.parse(undefined)).toBeNull();
    expect(photoCaptionSchema.parse(null)).toBeNull();
    expect(photoCaptionSchema.parse('正確的收拳角度')).toBe('正確的收拳角度');
  });

  it('rejects text beyond the cap', () => {
    expect(() => photoCaptionSchema.parse('あ'.repeat(2001))).toThrow();
  });
});

describe('photoVariantSchema', () => {
  it('accepts the three variants and defaults to display', () => {
    expect(photoVariantSchema.parse(undefined)).toBe('display');
    for (const v of ['display', 'original', 'annotated']) expect(photoVariantSchema.parse(v)).toBe(v);
  });

  it('rejects anything else', () => {
    expect(() => photoVariantSchema.parse('thumbnail')).toThrow();
  });
});

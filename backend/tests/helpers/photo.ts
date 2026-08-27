import type request from 'supertest';
import type { SeededAgent } from './http';

/**
 * Reference-photo test helpers. The fixtures are byte-valid headers rather than real images —
 * the server validates by magic bytes and stores what it is given, so a full encode would only
 * make the tests slower.
 */
export const JPEG_BYTES = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
  Buffer.from('JFIF\0'),
  Buffer.alloc(64, 0x41),
]);
export const JPEG_BYTES_2 = Buffer.concat([JPEG_BYTES, Buffer.from('second')]);
export const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 0x42),
]);
export const HEIC_BYTES = Buffer.concat([
  Buffer.from([0x00, 0x00, 0x00, 0x18]),
  Buffer.from('ftypheic'),
  Buffer.alloc(64, 0x43),
]);
export const NOT_AN_IMAGE = Buffer.from('#!/bin/sh\necho not an image\n'.repeat(4));

export interface UploadOptions {
  panelIndex?: number | null;
  caption?: string;
  original?: Buffer;
  display?: Buffer;
  originalAsJpeg?: Buffer;
  originalName?: string;
}

/** POST a photo as the given reviewer. Returns the supertest response. */
export const uploadPhoto = (
  r: SeededAgent,
  code: string,
  opts: UploadOptions = {},
): request.Test => {
  const req = r.agent
    .post(`/api/reviews/${code}/photos`)
    .set('X-CSRF-Token', r.csrf)
    .attach('original', opts.original ?? JPEG_BYTES, opts.originalName ?? 'hand.jpg')
    .attach('display', opts.display ?? JPEG_BYTES, 'hand-1600.jpg');
  if (opts.originalAsJpeg) req.attach('originalAsJpeg', opts.originalAsJpeg, 'hand-full.jpg');
  if (opts.panelIndex != null) req.field('panelIndex', String(opts.panelIndex));
  if (opts.caption != null) req.field('caption', opts.caption);
  return req;
};

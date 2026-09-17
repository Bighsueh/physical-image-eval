import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { renderPlaceholderPng } from '../../../scripts/demo/placeholder-png';

/** Minimal PNG reader: returns IHDR fields + the decompressed scanlines of every IDAT chunk. */
const readPng = (buf: Buffer) => {
  expect(buf.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  let offset = 8;
  const idat: Buffer[] = [];
  let ihdr: { width: number; height: number; bitDepth: number; colorType: number } | null = null;
  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.subarray(offset + 4, offset + 8).toString('ascii');
    const data = buf.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      ihdr = { width: data.readUInt32BE(0), height: data.readUInt32BE(4), bitDepth: data[8], colorType: data[9] };
    }
    if (type === 'IDAT') idat.push(data);
    offset += 12 + length;
  }
  return { ihdr, raw: inflateSync(Buffer.concat(idat)) };
};

describe('renderPlaceholderPng (demo image source)', () => {
  it('produces a valid 8-bit RGB PNG of the requested size', () => {
    const { ihdr, raw } = readPng(renderPlaceholderPng({ blueprintId: 'S1', size: 256 }));
    expect(ihdr).toEqual({ width: 256, height: 256, bitDepth: 8, colorType: 2 });
    expect(raw.length).toBe(256 * (1 + 256 * 3)); // one filter byte per scanline
  });

  it('draws something — not a single flat colour', () => {
    const { raw } = readPng(renderPlaceholderPng({ blueprintId: 'K5', size: 256 }));
    const colours = new Set<string>();
    for (let i = 1; i < raw.length; i += 3 * 16) colours.add(raw.subarray(i, i + 3).toString('hex'));
    expect(colours.size).toBeGreaterThan(3);
  });

  it('tints each region differently and is deterministic per blueprint', () => {
    const a = renderPlaceholderPng({ blueprintId: 'S1', size: 128 });
    expect(renderPlaceholderPng({ blueprintId: 'S1', size: 128 })).toEqual(a);
    expect(renderPlaceholderPng({ blueprintId: 'Y1', size: 128 })).not.toEqual(a);
  });

  it('rejects an id it cannot label', () => {
    expect(() => renderPlaceholderPng({ blueprintId: 'Z1', size: 128 })).toThrow(/region/);
  });
});

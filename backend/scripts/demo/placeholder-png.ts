import { deflateSync } from 'node:zlib';

/**
 * Dependency-free placeholder art for the synthetic demo image source: a 2×2 "exercise comic" with
 * a region-tinted header, numbered panels and a stick figure whose arms rise panel by panel. It only
 * has to look like the real layout; the clinical images are never distributed with the repo.
 */

type Rgb = readonly [number, number, number];

const REGION_TINT: Record<string, Rgb> = {
  S: [214, 132, 94],
  H: [120, 150, 196],
  E: [150, 170, 110],
  T: [196, 160, 84],
  P: [170, 120, 170],
  K: [96, 160, 150],
  L: [200, 110, 120],
  Y: [110, 130, 100],
};
const PAPER: Rgb = [250, 246, 238];
const PANEL: Rgb = [255, 253, 248];
const INK: Rgb = [70, 66, 58];

/** 5×7 bitmap glyphs for the header label (`S1 DEMO` etc.). */
const GLYPHS: Record<string, string[]> = {
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  '0': ['01110', '10011', '10101', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};

class Canvas {
  readonly pixels: Buffer;

  constructor(readonly size: number, background: Rgb) {
    this.pixels = Buffer.alloc(size * size * 3);
    this.fillRect(0, 0, size, size, background);
  }

  fillRect(x0: number, y0: number, w: number, h: number, c: Rgb): void {
    const x1 = Math.min(this.size, Math.round(x0 + w));
    const y1 = Math.min(this.size, Math.round(y0 + h));
    for (let y = Math.max(0, Math.round(y0)); y < y1; y += 1) {
      for (let x = Math.max(0, Math.round(x0)); x < x1; x += 1) this.set(x, y, c);
    }
  }

  /** Thick line segment (or a filled disc when both ends coincide). */
  stroke(ax: number, ay: number, bx: number, by: number, width: number, c: Rgb): void {
    const r = width / 2;
    const [minX, maxX] = [Math.floor(Math.min(ax, bx) - r), Math.ceil(Math.max(ax, bx) + r)];
    const [minY, maxY] = [Math.floor(Math.min(ay, by) - r), Math.ceil(Math.max(ay, by) + r)];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy || 1;
    for (let y = Math.max(0, minY); y <= Math.min(this.size - 1, maxY); y += 1) {
      for (let x = Math.max(0, minX); x <= Math.min(this.size - 1, maxX); x += 1) {
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
        const px = ax + t * dx - x;
        const py = ay + t * dy - y;
        if (px * px + py * py <= r * r) this.set(x, y, c);
      }
    }
  }

  text(label: string, x: number, y: number, scale: number, c: Rgb): void {
    [...label].forEach((ch, i) => {
      const glyph = GLYPHS[ch];
      if (!glyph) throw new Error(`no glyph for "${ch}"`);
      glyph.forEach((row, gy) =>
        [...row].forEach((bit, gx) => {
          if (bit === '1') this.fillRect(x + (i * 6 + gx) * scale, y + gy * scale, scale, scale, c);
        }),
      );
    });
  }

  private set(x: number, y: number, [r, g, b]: Rgb): void {
    const i = (y * this.size + x) * 3;
    this.pixels[i] = r;
    this.pixels[i + 1] = g;
    this.pixels[i + 2] = b;
  }
}

const drawPanel = (canvas: Canvas, x: number, y: number, side: number, step: number, tint: Rgb): void => {
  canvas.fillRect(x, y, side, side, tint);
  const inset = side * 0.012;
  canvas.fillRect(x + inset, y + inset, side - 2 * inset, side - 2 * inset, PANEL);
  canvas.stroke(x + side * 0.1, y + side * 0.1, x + side * 0.1, y + side * 0.1, side * 0.11, tint);
  canvas.text(String(step), x + side * 0.1 - side * 0.02, y + side * 0.1 - side * 0.028, side * 0.008, PANEL);

  // Stick figure: arms sweep from down (step 1) to overhead (step 4).
  const cx = x + side * 0.5;
  const w = side * 0.028;
  const shoulderY = y + side * 0.42;
  canvas.stroke(cx, y + side * 0.3, cx, y + side * 0.3, side * 0.12, INK);
  canvas.stroke(cx, shoulderY, cx, y + side * 0.66, w, INK);
  canvas.stroke(cx, y + side * 0.66, cx - side * 0.1, y + side * 0.88, w, INK);
  canvas.stroke(cx, y + side * 0.66, cx + side * 0.1, y + side * 0.88, w, INK);
  const angle = (Math.PI / 180) * [-60, -15, 20, 42][step - 1];
  const arm = side * 0.2;
  for (const dir of [-1, 1]) {
    canvas.stroke(cx, shoulderY, cx + dir * arm * Math.cos(angle), shoulderY - arm * Math.sin(angle), w, INK);
  }
};

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf: Buffer): number => {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer): Buffer => {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
};

const encodePng = (canvas: Canvas): Buffer => {
  const { size, pixels } = canvas;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour RGB
  const rowBytes = size * 3;
  const raw = Buffer.alloc(size * (rowBytes + 1));
  for (let y = 0; y < size; y += 1) pixels.copy(raw, y * (rowBytes + 1) + 1, y * rowBytes, (y + 1) * rowBytes);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

export const renderPlaceholderPng = ({ blueprintId, size }: { blueprintId: string; size: number }): Buffer => {
  const tint = REGION_TINT[blueprintId[0]];
  if (!tint) throw new Error(`unknown region for blueprint "${blueprintId}"`);
  const canvas = new Canvas(size, PAPER);

  const header = size * 0.12;
  canvas.fillRect(0, 0, size, header, tint);
  const scale = Math.max(1, Math.floor(header / 12));
  canvas.text(`${blueprintId} DEMO`, size * 0.04, (header - 7 * scale) / 2, scale, PANEL);

  const gap = size * 0.03;
  const side = (size - header - 3 * gap) / 2;
  const left = (size - 2 * side - gap) / 2;
  const top = header + gap;
  for (let step = 1; step <= 4; step += 1) {
    const col = (step - 1) % 2;
    const row = Math.floor((step - 1) / 2);
    drawPanel(canvas, left + col * (side + gap), top + row * (side + gap), side, step, tint);
  }
  return encodePng(canvas);
};

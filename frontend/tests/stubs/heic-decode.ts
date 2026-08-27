/**
 * Test stub for `heic-decode`.
 *
 * The real decoder is `libheif-js` — several megabytes of asm.js that Vite must transform
 * before it can finish building the module graph, which stalls every test run. No test decodes
 * HEIC (jsdom has no canvas to draw into), so tests resolve this instead. Production is
 * unaffected: the real decoder is what the lazy chunk still pulls in.
 */
export default async function decode(): Promise<{
  width: number;
  height: number;
  data: Uint8ClampedArray;
}> {
  throw new Error('heic-decode is stubbed in tests');
}

/**
 * `heic-decode` ships no types. The surface we use is one function, so declaring it here is
 * cheaper — and more honest about what we actually depend on — than a community typing.
 */
declare module 'heic-decode' {
  interface DecodedImage {
    width: number;
    height: number;
    data: Uint8ClampedArray;
  }
  export default function decode(opts: { buffer: ArrayBuffer }): Promise<DecodedImage>;
}

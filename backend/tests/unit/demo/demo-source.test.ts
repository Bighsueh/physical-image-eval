import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ALL_REGION_CODES } from '../../../src/catalog/constants/catalog-constants';
import { readAndBuildCatalog } from '../../../src/ingestion/parser/build-catalog';
import { collectErrors } from '../../../src/ingestion/validation/invariants';

/**
 * The committed synthetic demo source (`demo/source`, built by `npm run demo:source`) is what
 * `docker compose up` ingests out of the box. It must keep passing every ingestion invariant, and
 * its images must be real PNGs rather than placeholders the browser cannot render.
 */
const DEMO_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../demo/source');
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('committed demo source', () => {
  const catalog = readAndBuildCatalog(DEMO_DIR);

  it('passes every ingestion invariant', () => {
    expect(collectErrors(catalog)).toEqual([]);
  });

  it('covers every region', () => {
    expect(new Set(catalog.blueprints.map((b) => b.regionCode))).toEqual(new Set(ALL_REGION_CODES));
  });

  it('ships a decodable PNG for every blueprint', () => {
    const imageRoot = join(DEMO_DIR, '_產圖');
    const pngs = readdirSync(imageRoot, { recursive: true, encoding: 'utf8' }).filter((p) => p.endsWith('.png'));
    expect(pngs).toHaveLength(catalog.blueprints.length);
    for (const rel of pngs) {
      const bytes = readFileSync(join(imageRoot, rel));
      expect(bytes.subarray(0, 8)).toEqual(PNG_SIGNATURE);
      expect(bytes.length).toBeGreaterThan(1000);
    }
  });
});

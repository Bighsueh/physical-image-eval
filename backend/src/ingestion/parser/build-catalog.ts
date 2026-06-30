import { readSource, type SourceData } from '../source/source-reader';
import { parseIndex } from './index-parser';
import { parseBlueprintMarkdown } from './markdown-parser';
import type { ParsedBlueprint, ParsedCatalog } from './types';

/**
 * Compose raw source → ParsedCatalog (pure, no DB). Each blueprint's `imagePath` is its single
 * matching PNG, or `''` when zero/many match — the FR-005 orphan/multi-image invariant flags those.
 */
export const buildCatalog = (source: SourceData): ParsedCatalog => {
  const imagesById = new Map<string, string[]>();
  for (const img of source.imageFiles) {
    const list = imagesById.get(img.blueprintId) ?? [];
    list.push(img.relImagePath);
    imagesById.set(img.blueprintId, list);
  }

  const blueprints: ParsedBlueprint[] = source.blueprintFiles.map((bf) => {
    const imgs = imagesById.get(bf.blueprintId) ?? [];
    const imagePath = imgs.length === 1 ? imgs[0] : '';
    return parseBlueprintMarkdown({
      content: bf.content,
      blueprintId: bf.blueprintId,
      regionCode: bf.regionCode,
      imagePath,
      sourceMarkdownRef: bf.relMarkdownPath,
    });
  });

  return {
    blueprints,
    diagnoses: parseIndex(source.indexContent),
    imageInventory: source.imageFiles.map((i) => i.blueprintId),
  };
};

export const readAndBuildCatalog = (sourceDir: string): ParsedCatalog =>
  buildCatalog(readSource(sourceDir));

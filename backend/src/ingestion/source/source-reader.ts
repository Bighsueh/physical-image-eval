import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { RegionCode } from '@prisma/client';
import { REGION_FOLDER_MAP } from '../../catalog/constants/catalog-constants';

/**
 * READ-ONLY source reader (FR-001). Opens files with read flags only — never writes/renames/moves/
 * deletes. Reads each region folder's blueprint `.md`, the `00` index, and inventories the PNGs
 * under `_產圖/<regionFolder>/`. Missing/unreadable source → SourceUnreadableError (drives exit 2).
 */
export class SourceUnreadableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SourceUnreadableError';
  }
}

const INDEX_FILENAME = '00_藍圖總索引與設計規範.md';
const IMAGE_ROOT = '_產圖';

/** blueprintId is the filename prefix before the first underscore (e.g. `S1_…` → `S1`). */
const idFromFilename = (fileName: string): string => fileName.split('_')[0];

export interface RawBlueprintFile {
  regionFolder: string;
  regionCode: RegionCode;
  blueprintId: string;
  fileName: string;
  relMarkdownPath: string;
  content: string;
}

export interface RawImageFile {
  regionFolder: string;
  fileName: string;
  blueprintId: string;
  relImagePath: string;
}

export interface SourceData {
  blueprintFiles: RawBlueprintFile[];
  indexContent: string;
  indexRelPath: string;
  imageFiles: RawImageFile[];
}

const isDir = (p: string): boolean => existsSync(p) && statSync(p).isDirectory();

export const readSource = (sourceDir: string): SourceData => {
  if (!isDir(sourceDir)) {
    throw new SourceUnreadableError(`來源目錄不存在或不可讀取：${sourceDir}`);
  }
  const indexPath = join(sourceDir, INDEX_FILENAME);
  if (!existsSync(indexPath)) {
    throw new SourceUnreadableError(`找不到總索引：${INDEX_FILENAME}`);
  }
  const indexContent = readFileSync(indexPath, 'utf8');

  const blueprintFiles: RawBlueprintFile[] = [];
  const imageFiles: RawImageFile[] = [];

  for (const [regionFolder, regionCode] of Object.entries(REGION_FOLDER_MAP)) {
    // Blueprint .md plans live in the top-level region folder.
    const mdFolder = join(sourceDir, regionFolder);
    if (isDir(mdFolder)) {
      for (const fileName of readdirSync(mdFolder)) {
        if (!fileName.endsWith('.md')) continue;
        blueprintFiles.push({
          regionFolder,
          regionCode,
          blueprintId: idFromFilename(fileName),
          fileName,
          relMarkdownPath: join(regionFolder, fileName),
          content: readFileSync(join(mdFolder, fileName), 'utf8'),
        });
      }
    }

    // PNGs live under _產圖/<regionFolder>/.
    const imgFolder = join(sourceDir, IMAGE_ROOT, regionFolder);
    if (isDir(imgFolder)) {
      for (const fileName of readdirSync(imgFolder)) {
        if (!fileName.toLowerCase().endsWith('.png')) continue;
        imageFiles.push({
          regionFolder,
          fileName,
          blueprintId: idFromFilename(fileName),
          relImagePath: join(IMAGE_ROOT, regionFolder, fileName),
        });
      }
    }
  }

  return { blueprintFiles, indexContent, indexRelPath: INDEX_FILENAME, imageFiles };
};

import type { RegionCode } from '@prisma/client';
import {
  BLUEPRINT_ID_REGEX,
  REGION_FOLDER_MAP,
} from '../../catalog/constants/catalog-constants';

/** Blueprint ID / region helpers (FR-022, D6). Pure — no DB, no throw; callers report failures. */

export const parseBlueprintId = (
  id: string,
): { regionCode: RegionCode; serial: number } | null => {
  const m = BLUEPRINT_ID_REGEX.exec(id);
  if (!m) return null;
  return { regionCode: m[1] as RegionCode, serial: Number(m[2]) };
};

export const isLegalBlueprintId = (id: string): boolean => BLUEPRINT_ID_REGEX.test(id);

/** Region code implied by a source folder base name (e.g. `01_肩部_SHOULDER` → `S`). */
export const regionCodeForFolder = (folderName: string): RegionCode | undefined =>
  REGION_FOLDER_MAP[folderName];

/** The id's region letter must equal the region of its containing folder (cross-check, D6). */
export const idMatchesFolder = (id: string, folderName: string): boolean => {
  const parsed = parseBlueprintId(id);
  const folderRegion = regionCodeForFolder(folderName);
  return parsed !== null && folderRegion !== undefined && parsed.regionCode === folderRegion;
};

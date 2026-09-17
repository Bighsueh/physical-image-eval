import type { RegionCode } from '@prisma/client';

/**
 * The SINGLE source of truth for the high-risk set and region metadata (FR-010, D6). Catalog
 * cardinalities are NOT constants: the source index is authoritative (FR-002/FR-003/FR-008).
 * Constitution: the high-risk constant must be defined exactly ONCE and shared by ingestion + UI.
 */

/** High-risk blueprints (術後／骨折，禁忌務必確認). Ingestion + UI both reference THIS set only. */
export const HIGH_RISK_BLUEPRINT_IDS = new Set<string>([
  'S4',
  'T8',
  'P1',
  'P4',
  'P5',
  'K2',
  'K3',
  'K5',
  'L3',
]);

/** Source region folder base-name → region code (D6). Same names under top-level and `_產圖/`. */
export const REGION_FOLDER_MAP: Record<string, RegionCode> = {
  '01_肩部_SHOULDER': 'S',
  '02_頭頸部_HEAD_NECK': 'H',
  '03_肘腕手_ELBOW_WRIST_HAND': 'E',
  '04_脊椎軀幹_SPINE_TRUNK': 'T',
  '05_骨盆髖_PELVIS_HIP': 'P',
  '06_膝部_KNEE': 'K',
  '07_小腿足踝_LOWER_LEG_FOOT': 'L',
  '08_全身運動處方_SYSTEMIC': 'Y',
};

export interface RegionMeta {
  nameZh: string;
  nameEn: string;
  displayOrder: number;
}

/** regionCode → display metadata (nameEn NOT parsed from the Chinese folder name; from here). */
export const REGION_NAME_MAP: Record<RegionCode, RegionMeta> = {
  S: { nameZh: '肩部', nameEn: 'SHOULDER', displayOrder: 1 },
  H: { nameZh: '頭頸部', nameEn: 'HEAD_NECK', displayOrder: 2 },
  E: { nameZh: '肘腕手', nameEn: 'ELBOW_WRIST_HAND', displayOrder: 3 },
  T: { nameZh: '脊椎軀幹', nameEn: 'SPINE_TRUNK', displayOrder: 4 },
  P: { nameZh: '骨盆髖', nameEn: 'PELVIS_HIP', displayOrder: 5 },
  K: { nameZh: '膝部', nameEn: 'KNEE', displayOrder: 6 },
  L: { nameZh: '小腿足踝', nameEn: 'LOWER_LEG_FOOT', displayOrder: 7 },
  Y: { nameZh: '全身運動處方', nameEn: 'SYSTEMIC', displayOrder: 8 },
};

export const ALL_REGION_CODES: RegionCode[] = ['S', 'H', 'E', 'T', 'P', 'K', 'L', 'Y'];

/** Blueprint ID shape: region letter + 1–2 digit serial (FR-022). */
export const BLUEPRINT_ID_REGEX = /^([SHETPKLY])([1-9][0-9]?)$/;

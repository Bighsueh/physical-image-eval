import { mkdirSync, rmSync, writeFileSync, unlinkSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RegionCode } from '@prisma/client';
import {
  ALL_REGION_CODES,
  REGION_FOLDER_MAP,
  REGION_NAME_MAP,
} from '../../src/catalog/constants/catalog-constants';

/**
 * Hermetic synthetic source-tree generator for 002 tests. `buildValidSource` writes a tree that
 * passes ALL invariants (index-declared blueprint set, every region populated, 4 panels, contiguous
 * diagnosis numbering, exact high-risk set). Mutators derive each-broken trees by
 * copying-then-breaking one invariant.
 *
 * The distribution is SYNTHETIC — it does not mirror the real corpus. It only has to contain every
 * high-risk ID plus the IDs individual tests reference. Tests assert against the FIXTURE_* exports.
 */
export const FIXTURE_REGION_COUNTS: Record<RegionCode, number> = {
  S: 4,
  H: 2,
  E: 6,
  T: 8,
  P: 5,
  K: 5,
  L: 3,
  Y: 2,
};
export const FIXTURE_TOTAL_BLUEPRINTS = Object.values(FIXTURE_REGION_COUNTS).reduce((a, n) => a + n, 0);
/** Diagnoses assigned round-robin to blueprints (MAPPED/TEMPLATE), then the referral rows. */
export const FIXTURE_MAPPED_DIAGNOSES = 70;
export const FIXTURE_REFERRAL_DIAGNOSES = 3;
export const FIXTURE_TOTAL_DIAGNOSES = FIXTURE_MAPPED_DIAGNOSES + FIXTURE_REFERRAL_DIAGNOSES;

const FOLDER_BY_CODE: Record<RegionCode, string> = Object.fromEntries(
  Object.entries(REGION_FOLDER_MAP).map(([folder, code]) => [code, folder]),
) as Record<RegionCode, string>;

export const blueprintIdsFor = (code: RegionCode): string[] =>
  Array.from({ length: FIXTURE_REGION_COUNTS[code] }, (_, i) => `${code}${i + 1}`);

export const allBlueprintIds = (): string[] => ALL_REGION_CODES.flatMap(blueprintIdsFor);

const blueprintMd = (id: string, code: RegionCode, coveredNames: string[]): string => {
  const meta = REGION_NAME_MAP[code];
  const panel = (n: number) =>
    `### ${n}. 步驟${n}\n- **動作說明**：${id} 第 ${n} 格動作說明。\n- **時間提示**：${n}0 秒。\n- **畫面視覺描述**：${id} 第 ${n} 格畫面。\n`;
  return [
    `# 運動${id}`,
    ``,
    `> 藍圖 ID：${id} ｜ 解剖區域：${meta.nameZh} ${meta.nameEn}`,
    `> 涵蓋診斷：${coveredNames.join('、')}`,
    `> 圖解藍圖版本 v1.0`,
    ``,
    `## 一、整體資訊`,
    ``,
    `- **運動名稱**：運動${id}`,
    `- **適應症**：${id} 適應症`,
    `- **練習次數**：每個動作 10 次，每日 2 回`,
    `- **溫馨小叮嚀**：💡 ${id} 小叮嚀。`,
    ``,
    `## 二、4 宮格分鏡圖解`,
    ``,
    panel(1),
    panel(2),
    panel(3),
    panel(4),
    `## 三、AI 產圖 Prompt`,
    ``,
    '```',
    `prompt for ${id}`,
    '```',
    ``,
  ].join('\n');
};

interface DiagnosisAssign {
  byBlueprint: Map<string, Array<{ no: number; name: string }>>;
}

/** Round-robin the mapped diagnoses (matrix 1..FIXTURE_MAPPED_DIAGNOSES) across all blueprints. */
const assignDiagnoses = (ids: string[]): DiagnosisAssign => {
  const byBlueprint = new Map<string, Array<{ no: number; name: string }>>();
  for (const id of ids) byBlueprint.set(id, []);
  for (let no = 1; no <= FIXTURE_MAPPED_DIAGNOSES; no += 1) {
    const id = ids[(no - 1) % ids.length];
    byBlueprint.get(id)!.push({ no, name: `診斷${no}` });
  }
  return { byBlueprint };
};

const indexMd = (assign: DiagnosisAssign): string => {
  const lines: string[] = ['# 總索引', '', '## 三、診斷 → 藍圖對照表', ''];
  for (const code of ALL_REGION_CODES) {
    const meta = REGION_NAME_MAP[code];
    lines.push(`### ${meta.nameZh} ${meta.nameEn}（${FIXTURE_REGION_COUNTS[code]} 份）`, '');
    lines.push('| 藍圖 ID | 藍圖檔名 | 涵蓋原始診斷（矩陣編號） |', '|---|---|---|');
    for (const id of blueprintIdsFor(code)) {
      const covered = (assign.byBlueprint.get(id) ?? []).map((d) => `${d.name}(${d.no})`).join('、');
      lines.push(`| ${id} | 運動${id} | ${covered} |`);
    }
    lines.push('');
  }
  lines.push(`### 不產藍圖：轉介類（${FIXTURE_REFERRAL_DIAGNOSES} 筆）`, '');
  lines.push('| 矩陣編號 | 診斷 | 處置 |', '|---|---|---|');
  for (let no = FIXTURE_MAPPED_DIAGNOSES + 1; no <= FIXTURE_TOTAL_DIAGNOSES; no += 1) {
    lines.push(`| ${no} | 轉介診斷${no} | 轉介眼科 |`);
  }
  lines.push('');
  return lines.join('\n');
};

/** PNG signature byte placeholder (content irrelevant to ingestion — only existence matters). */
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export const buildValidSource = (targetDir: string): void => {
  rmSync(targetDir, { recursive: true, force: true });
  mkdirSync(targetDir, { recursive: true });

  const ids = allBlueprintIds();
  const assign = assignDiagnoses(ids);

  for (const code of ALL_REGION_CODES) {
    const folder = FOLDER_BY_CODE[code];
    mkdirSync(join(targetDir, folder), { recursive: true });
    mkdirSync(join(targetDir, '_產圖', folder), { recursive: true });
    for (const id of blueprintIdsFor(code)) {
      const covered = (assign.byBlueprint.get(id) ?? []).map((d) => d.name);
      writeFileSync(join(targetDir, folder, `${id}_運動${id}.md`), blueprintMd(id, code, covered));
      writeFileSync(join(targetDir, '_產圖', folder, `${id}_運動${id}.png`), PNG_BYTES);
    }
  }

  writeFileSync(join(targetDir, '00_藍圖總索引與設計規範.md'), indexMd(assign));
};

// ── Mutators (build a valid tree first, then break ONE invariant) ──────────────

const mdPath = (dir: string, code: RegionCode, id: string): string =>
  join(dir, FOLDER_BY_CODE[code], `${id}_運動${id}.md`);
const pngPath = (dir: string, code: RegionCode, id: string): string =>
  join(dir, '_產圖', FOLDER_BY_CODE[code], `${id}_運動${id}.png`);

export const codeOf = (id: string): RegionCode => id[0] as RegionCode;

/** Rewrite a blueprint to have `n` panels (n ≠ 4 ⇒ FR-004). */
export const mutatePanelCount = (dir: string, id: string, n: number): void => {
  const code = codeOf(id);
  const md = readFileSync(mdPath(dir, code, id), 'utf8');
  const head = md.split('## 二、4 宮格分鏡圖解')[0];
  const tail = md.split('## 三、AI 產圖 Prompt')[1];
  const panels = Array.from({ length: n }, (_, i) =>
    `### ${i + 1}. 步驟${i + 1}\n- **動作說明**：動作${i + 1}。\n- **時間提示**：10 秒。\n- **畫面視覺描述**：畫面。\n`,
  ).join('\n');
  writeFileSync(
    mdPath(dir, code, id),
    `${head}## 二、4 宮格分鏡圖解\n\n${panels}\n## 三、AI 產圖 Prompt\n${tail}`,
  );
};

/** Blank a metadata field (適應症/練習次數/溫馨小叮嚀 ⇒ FR-006). */
export const mutateBlankMetadata = (dir: string, id: string, label: string): void => {
  const code = codeOf(id);
  const md = readFileSync(mdPath(dir, code, id), 'utf8');
  writeFileSync(
    mdPath(dir, code, id),
    md.replace(new RegExp(`- \\*\\*${label}\\*\\*：.*`), `- **${label}**：`),
  );
};

/** Blank a panel's action description (⇒ FR-007). */
export const mutateEmptyAction = (dir: string, id: string): void => {
  const code = codeOf(id);
  const md = readFileSync(mdPath(dir, code, id), 'utf8');
  writeFileSync(mdPath(dir, code, id), md.replace(/- \*\*動作說明\*\*：.*/, '- **動作說明**：'));
};

/** Delete a blueprint's PNG (⇒ FR-005 orphan blueprint). */
export const mutateDeleteImage = (dir: string, id: string): void =>
  unlinkSync(pngPath(dir, codeOf(id), id));

/** Add an extra PNG with no blueprint (⇒ FR-005 orphan image). */
export const mutateOrphanImage = (dir: string, code: RegionCode, fakeId: string): void =>
  writeFileSync(join(dir, '_產圖', FOLDER_BY_CODE[code], `${fakeId}_x.png`), PNG_BYTES);

/** Delete a whole blueprint (md + png) the index still lists (⇒ FR-002 missing blueprint). */
export const mutateDeleteBlueprint = (dir: string, id: string): void => {
  const code = codeOf(id);
  unlinkSync(mdPath(dir, code, id));
  unlinkSync(pngPath(dir, code, id));
};

/** Add a duplicate-id blueprint file (⇒ FR-022 duplicate). */
export const mutateDuplicateId = (dir: string, id: string): void => {
  const code = codeOf(id);
  writeFileSync(join(dir, FOLDER_BY_CODE[code], `${id}_dup.md`), readFileSync(mdPath(dir, code, id)));
  writeFileSync(join(dir, '_產圖', FOLDER_BY_CODE[code], `${id}_dup.png`), PNG_BYTES);
};

/** Drop the first referral row from the index, leaving a numbering gap (⇒ FR-008 gap). */
export const mutateDropDiagnosis = (dir: string): void => {
  const file = join(dir, '00_藍圖總索引與設計規範.md');
  const lines = readFileSync(file, 'utf8').split('\n');
  const firstReferral = FIXTURE_MAPPED_DIAGNOSES + 1;
  const idx = lines.findIndex((l) => new RegExp(`^\\|\\s*${firstReferral}\\s*\\|`).test(l));
  if (idx >= 0) lines.splice(idx, 1);
  writeFileSync(file, lines.join('\n'));
};

/** Edit one blueprint's metadata text (for re-run diff tests). */
export const mutateEditMetadata = (dir: string, id: string, newIndications: string): void => {
  const code = codeOf(id);
  const md = readFileSync(mdPath(dir, code, id), 'utf8');
  writeFileSync(
    mdPath(dir, code, id),
    md.replace(/- \*\*適應症\*\*：.*/, `- **適應症**：${newIndications}`),
  );
};

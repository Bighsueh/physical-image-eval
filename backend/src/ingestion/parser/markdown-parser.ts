import { createHash } from 'node:crypto';
import type { List, Root } from 'mdast';
import { toString } from 'mdast-util-to-string';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import type { ParsedRegionCode } from './types';
import { ParsedBlueprintSchema, type ParsedBlueprint, type ParsedPanel } from './types';

/**
 * Parse one blueprint `.md` into a ParsedBlueprint by walking the mdast section structure (D1) —
 * robust to incidental emoji/whitespace. NON-EMPTY business rules are NOT enforced here (they are
 * located + reported by invariants.ts); this parser only extracts the shape.
 */
const processor = unified().use(remarkParse);

const FULLWIDTH_COLON = /[：:]/;

/** Split "label：value" on the first (full/half-width) colon. */
const splitLabel = (text: string): [string, string] | null => {
  const m = FULLWIDTH_COLON.exec(text);
  if (!m || m.index === undefined) return null;
  return [text.slice(0, m.index).trim(), text.slice(m.index + 1).trim()];
};

const listToFields = (list: List): Map<string, string> => {
  const map = new Map<string, string>();
  for (const item of list.children) {
    const pair = splitLabel(toString(item).trim());
    if (pair && !map.has(pair[0])) map.set(pair[0], pair[1]);
  }
  return map;
};

const emptyToNull = (v: string | undefined): string | null => {
  const t = (v ?? '').trim();
  return t.length === 0 ? null : t;
};

const stripStepNumber = (heading: string): string =>
  heading.replace(/^\s*\d+\s*[.、．]\s*/, '').trim();

export interface ParseBlueprintInput {
  content: string;
  blueprintId: string;
  regionCode: ParsedRegionCode;
  imagePath: string;
  sourceMarkdownRef: string;
}

export const parseBlueprintMarkdown = (input: ParseBlueprintInput): ParsedBlueprint => {
  const root = processor.parse(input.content) as Root;

  let section: '一' | '二' | '三' | null = null;
  let overall: Map<string, string> = new Map();
  let title = '';
  const panelBuckets: Array<{ stepName: string; fields: Map<string, string> }> = [];
  let pendingStep: string | null = null;
  let aiPrompt = '';
  let blockquoteText = '';

  for (const node of root.children) {
    if (node.type === 'heading' && node.depth === 1) {
      title = toString(node).trim();
      continue;
    }
    if (node.type === 'blockquote' && !blockquoteText) {
      blockquoteText = toString(node);
      continue;
    }
    if (node.type === 'heading' && node.depth === 2) {
      const t = toString(node);
      if (t.includes('整體資訊')) section = '一';
      else if (t.includes('分鏡') || t.includes('宮格')) section = '二';
      else if (t.includes('Prompt') || t.includes('產圖')) section = '三';
      else section = null;
      pendingStep = null;
      continue;
    }
    if (section === '一' && node.type === 'list' && overall.size === 0) {
      overall = listToFields(node);
      continue;
    }
    if (section === '二') {
      if (node.type === 'heading' && node.depth === 3) {
        pendingStep = stripStepNumber(toString(node));
        continue;
      }
      if (node.type === 'list' && pendingStep !== null) {
        panelBuckets.push({ stepName: pendingStep, fields: listToFields(node) });
        pendingStep = null;
        continue;
      }
    }
    if (section === '三' && node.type === 'code' && !aiPrompt) {
      aiPrompt = node.value;
      continue;
    }
  }

  const panels: ParsedPanel[] = panelBuckets.map((b, i) => ({
    panelIndex: i + 1,
    stepName: b.stepName,
    actionDescription: (b.fields.get('動作說明') ?? '').trim(),
    timingHint: emptyToNull(b.fields.get('時間提示')),
    visualDescription: emptyToNull(b.fields.get('畫面視覺描述')),
  }));

  const versionMatch = /版本\s*(v[0-9][0-9.]*)/.exec(blockquoteText);
  const coveredMatch = /涵蓋診斷[：:]\s*([^]+?)(?:圖解藍圖|$)/.exec(blockquoteText);
  const coveredDiagnosisNames = coveredMatch
    ? coveredMatch[1]
        .split('、') // diagnoses are 、-separated; annotations use （…） / (…)
        .map((s) => s.replace(/[（(].*$/, '').trim()) // strip trailing annotation
        .filter((s) => s.length > 0)
    : [];

  const exerciseName = (overall.get('運動名稱') ?? title).trim();

  // Content hash over normalized content fields (NOT location) — powers idempotent diff (D4).
  const contentHash = createHash('sha256')
    .update(
      JSON.stringify({
        blueprintId: input.blueprintId,
        exerciseName,
        indications: (overall.get('適應症') ?? '').trim(),
        frequency: (overall.get('練習次數') ?? '').trim(),
        gentleReminder: (overall.get('溫馨小叮嚀') ?? '').trim(),
        version: versionMatch ? versionMatch[1] : '',
        panels,
        coveredDiagnosisNames,
      }),
    )
    .digest('hex');

  return ParsedBlueprintSchema.parse({
    blueprintId: input.blueprintId,
    regionCode: input.regionCode,
    exerciseName,
    indications: (overall.get('適應症') ?? '').trim(),
    frequency: (overall.get('練習次數') ?? '').trim(),
    gentleReminder: (overall.get('溫馨小叮嚀') ?? '').trim(),
    version: versionMatch ? versionMatch[1] : '',
    aiPrompt: aiPrompt.trim(),
    panels,
    coveredDiagnosisNames,
    imagePath: input.imagePath,
    sourceMarkdownRef: input.sourceMarkdownRef,
    contentHash,
  });
};

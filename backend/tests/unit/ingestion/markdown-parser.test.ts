import { describe, expect, it } from 'vitest';
import { parseBlueprintMarkdown } from '../../../src/ingestion/parser/markdown-parser';

const MD = `# 五十肩鐘擺與爬牆運動

> 藍圖 ID：S1 ｜ 解剖區域：肩部 SHOULDER
> 涵蓋診斷：五十肩、冰凍肩、沾黏性關節囊炎
> 圖解藍圖版本 v1.0

## 一、整體資訊

- **運動名稱**：五十肩鐘擺與爬牆運動
- **適應症**：肩關節僵硬、夜間肩痛
- **練習次數**：每個動作重複 10 次，每日 2～3 回
- **溫馨小叮嚀**：💡 動作放慢、循序漸進。

## 二、4 宮格分鏡圖解

### 1. 鐘擺運動
- **動作說明**：身體前傾，患側手自然下垂擺盪。
- **時間提示**：每方向擺動 30 秒。
- **畫面視覺描述**：人物站姿前傾。

### 2. 手指爬牆
- **動作說明**：面向牆站立，手指爬牆。
- **時間提示**：停留 10 秒。

### 3. 毛巾背後伸展
- **動作說明**：雙手握毛巾於背後伸展。

### 4. 收尾放鬆
- **動作說明**：聳肩繞圈放鬆。
- **時間提示**：繞圈 10 次。
- **畫面視覺描述**：人物坐姿聳肩。

## 三、AI 產圖 Prompt

\`\`\`
[整版四宮格] flat vector illustration, 2x2 grid.
\`\`\`
`;

describe('markdown-parser (D1)', () => {
  const parsed = parseBlueprintMarkdown({
    content: MD,
    blueprintId: 'S1',
    regionCode: 'S',
    imagePath: '_產圖/01_肩部_SHOULDER/S1_x.png',
    sourceMarkdownRef: '01_肩部_SHOULDER/S1_x.md',
  });

  it('extracts overall metadata (robust to the 💡 emoji prefix)', () => {
    expect(parsed.exerciseName).toBe('五十肩鐘擺與爬牆運動');
    expect(parsed.indications).toBe('肩關節僵硬、夜間肩痛');
    expect(parsed.frequency).toContain('10 次');
    expect(parsed.gentleReminder).toContain('💡');
    expect(parsed.version).toBe('v1.0');
  });

  it('extracts exactly 4 panels with stepName + actionDescription', () => {
    expect(parsed.panels).toHaveLength(4);
    expect(parsed.panels[0]).toMatchObject({ panelIndex: 1, stepName: '鐘擺運動' });
    expect(parsed.panels[0].actionDescription).toContain('擺盪');
    expect(parsed.panels.every((p) => p.actionDescription.length > 0)).toBe(true);
  });

  it('treats missing timingHint / visualDescription as null (optional)', () => {
    expect(parsed.panels[1].visualDescription).toBeNull(); // panel 2 has no 畫面視覺描述
    expect(parsed.panels[2].timingHint).toBeNull(); // panel 3 has neither timing nor visual
  });

  it('captures the AI prompt and a stable contentHash', () => {
    expect(parsed.aiPrompt).toContain('2x2 grid');
    expect(parsed.contentHash).toMatch(/^[0-9a-f]{64}$/);
    const again = parseBlueprintMarkdown({
      content: MD,
      blueprintId: 'S1',
      regionCode: 'S',
      imagePath: '_產圖/01_肩部_SHOULDER/S1_x.png',
      sourceMarkdownRef: '01_肩部_SHOULDER/S1_x.md',
    });
    expect(again.contentHash).toBe(parsed.contentHash); // deterministic
  });

  it('parses the per-blueprint covered diagnosis names (cross-check input)', () => {
    expect(parsed.coveredDiagnosisNames).toEqual(['五十肩', '冰凍肩', '沾黏性關節囊炎']);
  });
});

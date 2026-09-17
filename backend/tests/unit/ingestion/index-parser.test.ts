import { describe, expect, it } from 'vitest';
import { parseIndex, parseIndexBlueprintIds } from '../../../src/ingestion/parser/index-parser';

const INDEX = `# 總索引

## 三、診斷 → 藍圖對照表

### 肩部 SHOULDER

| 藍圖 ID | 藍圖檔名 | 涵蓋原始診斷（矩陣編號） |
|---|---|---|
| S1 | 五十肩鐘擺與爬牆運動 | 五十肩(4)、冰凍肩(12)、沾黏性關節囊炎(15) |
| S4 | 肩關節穩定運動 | 肩關節不穩定(76)、肩關節前脫臼(77) |

### 全身運動處方 SYSTEMIC

| 藍圖 ID | 藍圖檔名 | 涵蓋原始診斷（矩陣編號） |
|---|---|---|
| Y1 | 骨質疏鬆負重與平衡運動 | 骨質疏鬆(121)、骨質疏鬆症(122) |
| Y2 | 尚無對應診斷的藍圖 |  |

### 不產藍圖：轉介類

| 矩陣編號 | 診斷 | 處置 |
|---|---|---|
| 58 | 白內障 | 轉介眼科 |
| 81 | 胃潰瘍 | 轉介腸胃內科 |
`;

describe('index-parser (D2)', () => {
  const diagnoses = parseIndex(INDEX);

  it('parses matrixNo + nameZh from the (n) parenthesis', () => {
    const d = diagnoses.find((x) => x.matrixNo === 4);
    expect(d).toMatchObject({ nameZh: '五十肩', mappingKind: 'MAPPED', mappedBlueprintId: 'S1' });
  });

  it('derives TEMPLATE for Y-series and MAPPED for non-Y', () => {
    expect(diagnoses.find((d) => d.matrixNo === 121)).toMatchObject({
      mappingKind: 'TEMPLATE',
      mappedBlueprintId: 'Y1',
    });
    expect(diagnoses.find((d) => d.matrixNo === 76)?.mappingKind).toBe('MAPPED');
  });

  it('parses the referral table as REFERRAL with null blueprint', () => {
    expect(diagnoses.find((d) => d.matrixNo === 58)).toMatchObject({
      nameZh: '白內障',
      mappingKind: 'REFERRAL',
      mappedBlueprintId: null,
    });
    expect(diagnoses.filter((d) => d.mappingKind === 'REFERRAL')).toHaveLength(2);
  });

  it('counts all diagnoses (S1=3 + S4=2 mapped + Y1=2 template + 2 referral = 9 here)', () => {
    expect(diagnoses).toHaveLength(9);
    expect(diagnoses.filter((d) => d.mappingKind === 'MAPPED')).toHaveLength(5);
    expect(diagnoses.filter((d) => d.mappingKind === 'TEMPLATE')).toHaveLength(2);
  });

  it('lists every blueprint ID declared in the region tables, including rows with no diagnoses', () => {
    expect(parseIndexBlueprintIds(INDEX)).toEqual(['S1', 'S4', 'Y1', 'Y2']);
  });

  it('never treats referral-table rows as blueprint declarations', () => {
    const referralOnly = '### 不產藍圖：轉介類\n\n| 矩陣編號 | 診斷 | 處置 |\n|---|---|---|\n| S1 | 誤植 | x |\n';
    expect(parseIndexBlueprintIds(referralOnly)).toEqual([]);
  });
});

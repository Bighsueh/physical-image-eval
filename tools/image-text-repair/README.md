# image-text-repair

AIGC 運動衛教圖的中文文字修復管線:移除圖上原有中文(背景保留),以霞鶩文楷 TC 於原位置/原大小/原顏色重新渲染修正後文字。標題/小標用 Bold 700,內文用 Regular 400。**不重新產圖**。

## 原則

- 來源目錄**唯讀**;成品輸出到鏡像目錄 `<來源>_修正版/_產圖/<區域>/<同檔名>.png`。
- 只動中文行(含行內標點);獨立的 `30s`/`10s` 等拉丁數字標籤、💡、①–④ 徽章、時鐘、箭頭等圖示不動。
- 每張圖的修正需在 `overrides.yaml` 設 `approved: true` 才會輸出成品(人工確認閘門)。

## 安裝

需要 macOS(OCR 使用 Apple Vision,經 pyobjc 呼叫)。

```bash
python3 -m venv venv && ./venv/bin/pip install -r requirements.txt
```

字型不隨 repo 散佈:從 Google Fonts 下載 [LXGW WenKai TC](https://fonts.google.com/specimen/LXGW+WenKai+TC)(SIL OFL),
將 Light / Regular / Bold 存為 `fonts/LXGWWenKaiTC-Light.ttf`、`-Regular.ttf`、`-Bold.ttf`。

## 路徑設定(環境變數)

| 變數 | 預設 | 說明 |
|------|------|------|
| `IMAGE_SOURCE_DIR` | `images`(repo 根目錄的本機副本) | 來源目錄,絕對路徑或相對 repo 根。**唯讀**,只以 sha256 快照驗證。 |
| `IMAGE_OUTPUT_DIR` | `<來源>_修正版`(與來源同層) | 修正版鏡像輸出目錄,絕對路徑或相對 repo 根。 |

目錄結構與 [docs/DEVELOPMENT.md](../../docs/DEVELOPMENT.md#圖像來源目錄) 相同;修正版鏡像與來源同構,後端可直接指過去。

## 流程

```bash
./venv/bin/python repair.py snapshot                  # 首次:來源樹快照
./venv/bin/python repair.py extract  --image S1       # OCR+分類 → work/.../spec.json + crops/
./venv/bin/python repair.py proofread --image S1      # 產出 proofread_input.md(OCR+企劃 md)
# (AI/人工校對後產生 corrections.json:{line_id: {text, reason}})
./venv/bin/python repair.py apply-corrections --image S1 --corrections work/.../corrections.json
# → 產出 review.md(修正對照表)與 overrides.yaml
./venv/bin/python repair.py render --image S1 --preview   # 預覽:work/.../preview.png(不需核准)
# 使用者確認 review.md + preview 後,把 overrides.yaml 的 approved 改 true
./venv/bin/python repair.py render --image S1         # 正式輸出到修正版鏡像目錄
./venv/bin/python repair.py qa     --image S1         # qa_sheet.png + round-trip OCR 報告
./venv/bin/python repair.py verify                    # 確認來源樹零改動
```

`--image S1`(藍圖 ID 或完整檔名 stem)/ `--region 01_肩部_SHOULDER` / `--all` 可互換。

## overrides.yaml 可用鍵

```yaml
approved: false        # 改 true 才能 render 正式輸出
lines:
  p1.tip.L1:
    text: "動作輕鬆自然，"   # 覆寫最終文字
    skip: true               # 此行完全不動(不移除不重排)
    weight: 700              # 覆寫字重(300/400/700)
    erase: flat              # 用背景色平塗取代 inpaint
```

## 完工檢核清單

- [ ] `repair.py verify` 來源樹零差異
- [ ] 每張來源圖都有對應成品存在於修正版鏡像,檔名結構一致
- [ ] 所有圖都經 `approved: true` 才輸出
- [ ] 每張 qa_sheet.png 抽查;round-trip 不一致全數 triage(注意:Vision 對楷體偶有誤讀,如良→長,目視為準)
- [ ] overflow / busy-background flags 全數解決

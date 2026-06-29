# CLAUDE.md

本檔案為 Claude Code 在此專案工作時的指引。記錄「已確定的事實與約束」；標註 **TBD** 者為尚未討論定案、改動前需先與使用者確認的部分。

## 專案目的

`physical-image-eval` 是一個**給物理治療師／醫師審查 AIGC 運動衛教圖的 Web 工具**。

背景：團隊為「物理治療衛教 AI 助理」產出了 **51 張四格漫畫（2×2 四宮格）運動衛教圖**，由 AI 生成，涵蓋肩、頸、肘腕手、脊椎軀幹、骨盆髖、膝、小腿足踝，以及全身性運動處方（骨鬆、防跌、心肺、代謝等）。這些圖在上線給病人看之前，**需要醫師逐張把關臨床正確性與安全性**。本工具就是承載這個審查流程的介面。

### 審查者要做的事（4 個把關面向）

每張圖請審查者從以下角度評估，並標記 **✅ 通過** 或 **✏️ 需修改（附一句說明）**：

1. **動作對不對** — 4 個分解動作是否為該診斷的標準復健運動。
2. **安全與禁忌** — 注意事項是否充分，特別是術後／急性期／骨鬆等高風險情境。
3. **適應症對不對** — 該圖對應的診斷（含合併進來的同義診斷）是否合理。
4. **文字／畫面有沒有錯** — AI 產圖偶有錯字、秒數、箭頭錯誤。

> 高風險、禁忌務必確認的圖：S4、T8、P1、P4、P5、K2、K3、K5、L3（涉及術後／骨折）。

## 架構

前後端分離，皆部署於 Docker。

| 層 | 技術 |
|----|------|
| 前端 | React + Tailwind CSS |
| 後端 | Node.js |
| 資料庫 | PostgreSQL |
| 部署 | Docker（前後端各自容器化） |

## 資料來源（圖像，唯讀）

AIGC 圖像來源目錄（**唯讀，不得修改或寫入**）：

```
/path/to/image-source
```

結構重點：

- `_產圖/<區域資料夾>/<編號_名稱>.png` — **51 張 PNG**，依 8 個解剖區域分資料夾。
- `<區域資料夾>/<編號_名稱>.md` — 每張圖對應的完整圖文企劃（整體資訊、4 宮格分鏡、AI 產圖 prompt）。
- `00_藍圖總索引與設計規範.md` — 總索引、134 診斷 → 51 藍圖對照表、共用視覺設計規範。
- `醫師審查說明.md` — 審查需求與檢查清單（4 個把關面向的來源）。

藍圖 ID 規則：**區域字母 + 序號**（S=肩、H=頭頸、E=肘腕手、T=脊椎軀幹、P=骨盆髖、K=膝、L=小腿足踝、Y=全身處方）。例：`S1_五十肩鐘擺與爬牆運動.png`。

> 圖像為唯讀外部資產，不在 repo 內。後端應以唯讀方式提供（如唯讀 volume 掛載），切勿在來源目錄寫入任何檔案。

## Port 配置

開發時用 localhost，須避開本機已佔用的 port。

**本機已佔用（請勿使用）**：`5000`、`7000`（Apple AirPlay/ControlCenter）、`5432`（host PostgreSQL）、`32222`（OrbStack）。

**本專案開發 port（提案，TBD 可調整）**：

| 服務 | Host port | 說明 |
|------|-----------|------|
| 前端 (Vite dev) | `5180` | 避開 5432/5000/7000 |
| 後端 (Node.js) | `3100` | |
| PostgreSQL (Docker) | `5433` → 容器內 5432 | host 5432 已被佔用，對外改用 5433 |

> 任何新增服務都要先確認 port 未被佔用：`lsof -nP -iTCP -sTCP:LISTEN`。

## 部署

- **開發**：localhost（見上方 port 配置）。
- **生產**：以 **Cloudflared** 託管，網域 `https://your-domain.example.com`。

## 開發方法：Spec Driven Design（GitHub Spec Kit）

本專案採 **SDD**，工具為 **GitHub Spec Kit**（已 `specify init`，skills 安裝於 `.claude/skills/speckit-*`）。

- **至高原則**：spec 是唯一真實來源。**先改 spec，再讓 code 跟著 spec**；現況與 spec 不一致時，先修 spec。
- **治理原則**：見 `.specify/memory/constitution.md`（11 條不可違反原則）。任何 code 變更都需可追溯到某條原則或某 feature spec 需求。
- **規格位置**：`specs/<NNN-feature>/`（spec.md=WHAT/WHY、plan.md=HOW/技術、tasks.md=任務）。本專案切為四個 feature：`001-accounts-auth`、`002-blueprint-catalog-ingestion`、`003-reviewer-review-workflow`、`004-admin-dashboard-export`。
- **運作迴圈**：`/speckit-constitution → /speckit-specify → /speckit-clarify → /speckit-plan → /speckit-checklist → /speckit-tasks → /speckit-analyze → /speckit-implement`。
- **規格規劃**：整體 Spec Plan 見 `~/.claude/plans/snoopy-snuggling-whale.md`。

> `.specify/` 與 `.claude/skills/speckit-*` 為 Spec Kit 框架檔，請勿手動破壞其結構；spec 內容改動走上述迴圈。

## 待討論的設計（改由 spec 承載；於 /speckit-clarify 釐清）

以下細節**不在 spec 的 WHAT/WHY 階段定案**，於 `/speckit-clarify`（開放議題見 Spec Plan §9）或 `/speckit-plan`（技術細節）決定，**不要在缺 spec 的情況下直接寫 code**：

- 資料庫 schema（圖像、藍圖 metadata、審查紀錄、審查者）。
- 審查者身分／帳號機制（是否需登入、多位醫師、權限）。
- 審查結果的資料模型（4 面向各自的通過/需修改 + 意見，或整體一欄）。
- API 設計（端點、回應格式）。
- 圖像如何被後端提供（唯讀掛載 vs 啟動時匯入 metadata）。
- 前端審查介面的互動流程與版面。

## 工作慣例

- 遵循使用者全域規則（`~/.claude/rules/`）：immutability、小檔案優先（200–400 行）、完整錯誤處理、邊界輸入驗證、80% 測試覆蓋、commit 前安全檢查（無硬編碼祕密）。
- Commit 訊息格式：`<type>: <description>`（type：feat/fix/refactor/docs/test/chore/perf/ci）。
- 已初始化為 git repo（branch `main`）。尚無 commit；使用者要求時才 commit/push。

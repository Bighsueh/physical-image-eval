# physical-image-eval Constitution

> 物理治療衛教 AIGC 圖像審查工具的治理原則。本憲章凌駕一切其他慣例。
> 對齊使用者全域規則（`~/.claude/rules/`）與專案 `CLAUDE.md` 的已鎖定事實。

## Core Principles

### I. Spec-First Authority（spec 至高，NON-NEGOTIABLE）

spec 是唯一真實來源。**無對應 spec 改動，就不得改 code**；當現況與 spec 不一致時，**先改 spec，再讓 code 跟上**。每個變更（PR/commit）都必須可追溯到某條本憲章原則或某 feature `spec.md` 的需求；無法追溯者不得合併。工具升級（Spec Kit 本身）與 feature 規格演進分開處理。

### II. Read-Only External Image Data（外部圖像唯讀，NON-NEGOTIABLE）

AIGC 圖像來源目錄 `…/物理治療師/專案文件/04_運動圖解藍圖`（51 張 PNG + 藍圖 `.md`）為**唯讀外部資產**，永遠不得寫入、移動、改名、刪除，也不得複製進 repo。後端只能以唯讀方式掛載／匯入。任何 code path 都不得對來源目錄產生寫入；ingestion 失敗時不得留下半套資料。

### III. No Open Registration（無開放註冊，NON-NEGOTIABLE）

帳號**只能由系統管理員建立**。任何介面（已登入或未登入）都不得存在自助註冊、邀請註冊或「建立帳號」的入口、路由、連結或表單。違反此原則即為安全缺陷。

### IV. Least-Privilege, Server-Enforced Roles（最小權限、伺服器端強制角色）

僅兩種角色，嚴格分離：**系統管理員**（帳號 CRUD + 進度儀表板 + 匯出結果，**本人不審圖**）與**審查者**（只審圖、只見自己的紀錄）。角色與授權檢查一律在**伺服器邊界**強制；前端隱藏僅為縱深防禦，不得作為唯一防線。審查者 session 永遠到不了管理介面或他人資料。

### V. Security Baseline（安全基線，commit 前閘道）

每次 commit 前必須滿足：無硬編碼祕密（API key/密碼/token 一律 env 或 secret manager，啟動時驗證存在）；所有邊界輸入對**固定允許值集合**驗證（列舉、ID、角色）；資料存取用參數化／安全查詢；free text 視為不可信、顯示時消毒（防 XSS）；登入失敗訊息一律泛用（不洩漏帳號是否存在）；log 不含敏感資料；端點具速率限制。發現安全問題即停工修復。

### VI. Immutability & Small-File Discipline（不可變與小檔案紀律）

優先建立新物件，不就地修改既有物件。多個小而專注的檔案優於少數巨檔（典型 200–400 行，上限 800）；依 feature/領域組織而非依型別。函式小（<50 行）、巢狀淺（≤4 層）。完整且顯式的錯誤處理，不靜默吞錯，UI 面向錯誤需友善訊息、伺服器端記錄詳細脈絡。

### VII. Test-First, Coverage ≥ 80%（測試先行，NON-NEGOTIABLE）

採 TDD：先寫測試（RED）→ 最小實作（GREEN）→ 重構（IMPROVE）。三類測試皆需：unit、integration、E2E（關鍵流程）。整體覆蓋率 ≥ 80%。測試失敗時修實作而非改測試（除非測試本身錯）。

### VIII. Traditional Chinese (zh-TW) Only（僅繁體中文）

所有 UI 文案、列舉選項標籤、驗證訊息、匯出欄位皆為繁體中文。文案是規格的一部分，寫進 spec、走 spec-first 審閱後才改。無語言切換器。列舉值（如 通過／需小修／需重做、各警語與問題類型選項）以 spec 為準、逐字一致。

### IX. Accessibility & Clinician Readability（無障礙與臨床可讀性）

狀態不得只靠顏色傳達（須並附文字／圖示，如審查狀態徽章、高風險標記）。主要操作可純鍵盤完成（審查一張乾淨圖的快路徑必須鍵盤可達）。臨床文字清晰易讀。以桌機／筆電為主要使用情境。

### X. Fixed Environment Constraints（固定環境約束）

前後端分離、皆 Docker 化（FE/BE 各容器 + Postgres 容器）。開發 port：前端 `5180`、後端 `3100`、Postgres `5433→5432`；避開本機已佔用的 `5000`/`7000`/`5432`/`32222`，宣告任何新 port 前先確認未被佔用（`lsof -nP -iTCP -sTCP:LISTEN`）。生產經 **Cloudflared** 託管於 `https://your-domain.example.com`，session/cookie 安全須適配該網域。

### XI. Catalog / Review Domain Separation（目錄域與審查域分離）

兩個資料域嚴格分離：**目錄域**（唯讀參考：解剖區域、51 藍圖、每張 4 格、134→51 診斷對照、高風險旗標）只由重跑 ingestion 從來源目錄產生，使用者永不建立／編輯；**審查域**（可變：帳號、每(審查者×圖)的審查與分格註記）是使用者唯一能建立／改動的資料。審查資料永不改動目錄域。

## Additional Constraints（技術棧與固定事實）

- **技術棧**：前端 React + Tailwind CSS；後端 Node.js；資料庫 PostgreSQL；部署 Docker。
- **受審內容**：51 張 2×2 四宮格 AIGC 運動衛教圖，分 8 解剖區域（S/H/E/T/P/K/L/Y；計數 S4 H4 E6 T8 P5 K7 L5 Y12）。
- **高風險圖（術後／骨折，禁忌務必確認）**：`{S4, T8, P1, P4, P5, K2, K3, K5, L3}` — 全專案以**單一具名常數**引用（ingestion 與 UI 共用），不得重複定義而分歧。
- **審查模型**：每位審查者各自獨立審完全部 51 張；同一張圖累積多位審查者的獨立結果，可跨人比對。

## Development Workflow & Quality Gates（SDD 運作迴圈與品質閘道）

- **迴圈**：`/speckit-constitution → /speckit-specify → /speckit-clarify →（人工審 spec）→ /speckit-plan → /speckit-checklist → /speckit-tasks → /speckit-analyze → /speckit-implement`。
- **spec 階段只談 WHAT/WHY**（使用者故事、需求、驗收標準），不談技術；技術（DB schema、API contract、auth 機制、元件設計）一律延後到 `/speckit-plan`。
- **閘道**：spec 內 `[NEEDS CLARIFICATION]` 未清空前不得進 `/speckit-plan`；每份 spec 須逐條對照本憲章 11 原則檢查；高風險常數、唯讀來源、無開放註冊三者須三重覆蓋（憲章 + spec 驗收 + UI 規則）。
- **commit/PR**：訊息格式 `<type>: <description>`；合併前過 §V 安全檢查與 §VII 覆蓋率閘道。

## Governance

本憲章凌駕一切其他開發慣例。當語言別／全域規則與本憲章衝突時，**本憲章（最特定）優先**。修訂本憲章須：記錄變更理由、評估對既有 spec 的影響、更新版本號與日期。所有 review 都須驗證對本憲章的符合性；任何「為求快而違反原則」的複雜度都須明確正當化或駁回。runtime 開發指引見專案根目錄 `CLAUDE.md`。

**Version**: 1.0.0 | **Ratified**: 2026-06-30 | **Last Amended**: 2026-06-30

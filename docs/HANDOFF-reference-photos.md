# 交接：審查者參考照片與標註

> 功能已完整實作並通過測試（2026-08-28）。這份文件只記錄 **spec 裡沒有的東西**——
> 部署順序、運維地雷、刻意沒做的部分。行為規格請看
> `specs/003-reviewer-review-workflow/` 與 `specs/004-admin-dashboard-export/`
> 的 2026-08-27／08-28 修訂段。

## 這是什麼

審查者發現某一格的動作示範有誤時，文字往往講不清楚。現在他可以直接在該格附上
自己拍的照片，並可選擇在站內畫箭頭標註；管理端把已提交審查的照片匯集成修圖
工作台，並可整包下載。

- 設計文件（草圖、逐條 UI 計畫、架構決策 AD-1～AD-15）：
  <https://claude.ai/code/artifact/a6a8ba39-f39e-4451-bf94-fb4fa37655a4>
- 需求：003 FR-045..FR-062、SC-012..SC-021；004 FR-025..FR-037、SC-011..SC-017

## ⚠️ 部署到正式環境前必做

**遷移前先取既有審查資料的基準，遷移後比對。** 這一步 CI 代勞不了，而且遷移
之後就補不回來了：

```bash
# 對著正式資料庫執行（DATABASE_URL 指向它）
npx tsx backend/tests/regression/capture-review-corpus.ts /path/to/before.json
npx prisma migrate deploy -w backend
npx tsx backend/tests/regression/capture-review-corpus.ts /path/to/after.json
diff <(jq -S .rows /path/to/before.json) <(jq -S .rows /path/to/after.json)   # 必須無差異
```

本次遷移是純新增（兩個 `CREATE TABLE`，既有九張表零 `ALTER`），但 SC-017 要求
的是「證明」而不是「相信」。開發機資料庫是空的，所以 CI 只能用種子資料驗證。

**新增的環境變數**（都有預設值，不設也能跑，已寫進 `docker-compose.yml`）：

| 變數 | 預設 | 說明 |
|---|---|---|
| `PHOTO_STORAGE_LIMIT_BYTES` | 10 GiB | 照片總量上限。**只擋照片上傳**，不影響審查提交 |
| `PHOTO_MAX_FILE_BYTES` | 25 MiB | 單檔上限 |
| `ADMIN_READ_RATE_MAX` | 200/min | 管理端讀取限流（原本寫死，改為可設定） |

## 運維地雷

**nginx 的 `client_max_body_size` 不能拿掉。** 預設 1 MiB 會讓所有手機照片上傳在
nginx 就被回 413，連後端都到不了——審查者看到的是通用失敗，不是我們的中文訊息。
這個只在 Docker／正式路徑出現，dev 走 Vite proxy 沒有這個限制，所以**全套測試
綠燈也發現不了**。已設 64m 並附註原因。

**`npx playwright test` 會清空帳號表，而且連的是 `localhost:5433`。**
`e2e/global-setup.ts` 會 `TRUNCATE Account`（Review／照片跟著 cascade）並重種
bootstrap admin。如果你正拿 Docker 當展示環境，跑 E2E 會把展示資料一起洗掉，
admin 密碼也會被輪換成 `e2e/api.ts` 裡的 `ADMIN_NEW_PASS`。兩者別同時用。

**E2E 預設直連 3100，但 Docker 的後端刻意不對外開**（SEC-M1）。要對容器跑 E2E：

```bash
E2E_API_URL=http://localhost:5180 E2E_BOOTSTRAP_PASS="$(grep BOOTSTRAP_ADMIN_PASSWORD backend/.env | cut -d= -f2- | tr -d '"')" npx playwright test
```

**容量統計是唯一含草稿的數字。** 它量的是磁碟，不是審查進度。其他所有照片數字
（工作台、附照片欄、打包、匯出）一律只算已提交。這在 `photo-storage.readonly.ts`
與 004 data-model 都有註明，別當成 bug 修掉。

## 三個容易踩的實作約束

1. **照片不可掛在 `PanelReview` 底下。** autosave 每次都把四筆分格紀錄整批
   `deleteMany` + `createMany`，掛在那裡的照片會在第一次存草稿時消失。照片掛
   `Review`，用可為空的 `panelIndex` 表示分格。
2. **提交關卡必須在 submit 的 transaction 內併查照片數。** 審查者可以上傳照片後
   立刻按提交，此時 800ms 的文件 debounce 還沒送出——只看文件會誤判成未處理。
   規則抽在 `backend/src/reviews/services/panel-gate.ts`，前端 `reviewDraft.ts`
   的 `isPanelAddressed` 是它的鏡像，兩邊要一起改。
3. **管理端所有照片查詢一律從 `Review(status=SUBMITTED)` 出發。**
   `photo-read.repository.ts` 是唯一的咽喉點；從 `ReviewPhoto` 反向查會讓草稿
   照片從側門外洩，而 FR-007「草稿不入統計」涵蓋不到這條路徑。

## 刻意沒做的

- **全域打包**（一次抓 51 張圖的全部照片）——004 FR-033 列為留存待議。目前只有
  「一張圖一包」。
- **「已採用／已修正」狀態追蹤**——那是修圖端自己的工作流，會把這個功能撐大一圈。
- **伺服器端影像處理**——`sharp` 的預編譯 binary 不含 HEIC 解碼（Nokia HEIF 專利
  授權），要支援得自行編譯 libvips。改成全部在瀏覽器做，伺服器一個影像相依都沒裝。

## 已知風險

- **Filerobot 鎖在 v4.9.1**：v5 需要 React 19，專案在 18。連帶鎖住
  `react-konva@18`／`konva@9`／`styled-components@6`。升 React 時要一起處理。
- **標註狀態的匯出／載入官方標為 Experimental**，且 issue #259 記錄了 dpi／視窗
  尺寸換算的偏差。所以**存檔當下那張原尺寸標註版才是權威版本**，標註狀態只作為
  再編輯的輔助。
- **HEIC 在桌機 Chrome 靠 WASM 解碼**，一張 1200 萬畫素約需一到數秒。上傳的
  「準備中」狀態就是給它用的。

## 從零跑起來

```bash
BOOTSTRAP_ADMIN_PASSWORD='<強密碼>' COOKIE_SECURE=false docker compose up -d --build
# 後端容器啟動時會自動 migrate → 種 admin → ingest 型錄
```

前端 <http://localhost:5180>。首次以 bootstrap admin 登入會強制改密碼，之後由
管理員建立審查者帳號（系統無自助註冊——憲章 III）。

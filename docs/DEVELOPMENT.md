# Development guide ／ 開發指南

專案介紹見 [README](../README.md)（[繁體中文](../README.zh-TW.md)）。本文件只談怎麼把它跑起來。

> 開發方法：**Spec Driven Design**（GitHub Spec Kit）。spec 是唯一真實來源——先改 spec、再讓 code 跟上。
> 治理原則見 [`.specify/memory/constitution.md`](../.specify/memory/constitution.md)。

## Monorepo 結構

```
backend/    Express + Prisma + PostgreSQL（routes → controllers → services → repositories）
frontend/   React + Vite + TypeScript + Tailwind + React Router + TanStack Query
e2e/        Playwright 端對端測試
docker-compose.yml   postgres + backend + frontend（backend 以唯讀掛載外部圖像來源）
specs/      四個 feature 的 spec / plan / tasks（001 帳號認證 … 004 儀表板匯出）
```

需求：Node.js 22、Docker（含 compose plugin）。

## 開發 port

| 服務 | Host port |
|------|-----------|
| 前端（Vite dev／Docker nginx） | `5180` |
| 後端（Node.js，僅 host 開發模式） | `3100` |
| PostgreSQL（Docker） | `127.0.0.1:5433` → 容器 `5432`（只綁本機） |

Docker 模式下後端**不對 host 開放**，只經由前端 nginx 的 `/api` 反向代理存取。
生產經 **Cloudflared** 託管；正式網域以 `COOKIE_DOMAIN` 設定，不寫進 repo。

## 圖像來源目錄

臨床圖像不隨 repo 散佈。repo 附一份**合成示範資料** `demo/source/`（佔位圖＋通過所有匯入檢查的企劃與總索引），兩份 `.env.example` 預設就指向它，複製後即可跑起來。要審真實圖時，把變數改指向你的來源目錄——它是**唯讀外部資產**，任何程式都不得寫入。

示範資料可用 `npm run demo:source` 重新產生；腳本只會覆寫帶有 `.demo-source` 標記的目錄，不會動到真實來源。

| 變數 | 檔案 | 用途 |
|------|------|------|
| `IMAGE_SOURCE_DIR` | `backend/.env` | 後端在 host 上直接跑時讀取的目錄。絕對路徑，或相對 `backend/`（範本預設 `../demo/source`）。 |
| `IMAGE_SOURCE` | 根目錄 `.env` | docker compose 唯讀掛載進容器的 host 目錄（compose 預設 `./images`，範本設為 `./demo/source`）；容器內固定為 `/data/blueprints`。 |

預期結構：

```
<來源目錄>/
├── 00_藍圖總索引與設計規範.md          # 總索引；藍圖集合與診斷對照以此為準
├── <區域資料夾>/<編號_名稱>.md          # 每張圖的圖文企劃（4 宮格分鏡）
└── _產圖/<區域資料夾>/<編號_名稱>.png   # 衛教圖
```

藍圖 ID ＝ 區域字母 + 序號（S 肩、H 頭頸、E 肘腕手、T 脊椎軀幹、P 骨盆髖、K 膝、L 小腿足踝、Y 全身處方）。

## 方式一：整套 Docker

```bash
cp .env.example .env     # 設定 BOOTSTRAP_ADMIN_PASSWORD；本機 http 請設 COOKIE_SECURE=false
docker compose up -d --build
# → http://localhost:5180
```

後端容器啟動時會依序執行：migrate deploy → 建立首位管理員（冪等）→ 匯入目錄 → 啟動服務。
`COOKIE_SECURE=true` 時瀏覽器會在 `http://localhost` 丟棄 cookie，導致無法登入。

## 方式二：host 上跑前後端（開發）

```bash
npm install                              # 安裝 workspace 全部相依
docker compose up -d postgres            # 只起 Postgres（5433）
cp backend/.env.example backend/.env     # 填入本機設定（勿提交真實祕密）

npm run prisma:migrate -w backend        # 套用資料庫遷移
npm run seed:bootstrap-admin -w backend  # 冪等建立首位系統管理員
npm run ingest -w backend                # 由來源目錄匯入目錄域（-- --check 只驗證不寫入）

npm run dev -w backend                   # http://localhost:3100
npm run dev -w frontend                  # http://localhost:5180（/api 代理到 3100）
```

各 feature 的細節見 `specs/00X-*/quickstart.md`。

## 測試（TDD，覆蓋率 ≥ 80%）

```bash
npm run test -w backend            # Vitest unit + supertest integration（使用獨立測試資料庫）
npm run test:coverage -w backend   # 覆蓋率閘道
npm run test -w frontend           # Vitest + React Testing Library
npm run e2e                        # Playwright（需前後端啟動）
npm run lint
```

E2E 注意事項：

- `e2e/global-setup.ts` 會**清空帳號表並重建 bootstrap admin**，連的是 `localhost:5433`。不要對著你想保留資料的環境跑。
- 測試套件會從同一 IP 大量登入；後端需以較高的 `LOGIN_RATE_MAX` 啟動，否則會觸發登入限流。
- 要對 Docker 容器跑 E2E（後端不對外開），將 `E2E_API_URL` 指向 `http://localhost:5180`。

更多運維細節見 [`HANDOFF-reference-photos.md`](HANDOFF-reference-photos.md)。

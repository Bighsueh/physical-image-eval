# physical-image-eval

物理治療衛教 **AIGC 運動衛教圖審查工具**。給物理治療師／醫師逐張把關 51 張四格漫畫運動衛教圖的臨床正確性與安全性。

> 開發方法：**Spec Driven Design**（GitHub Spec Kit）。spec 是唯一真實來源 — 先改 spec、再讓 code 跟上。治理原則見 [`.specify/memory/constitution.md`](.specify/memory/constitution.md)。

## Monorepo 結構

```
backend/    Express + Prisma + PostgreSQL（routes → controllers → services → repositories）
frontend/   React + Vite + TypeScript + Tailwind + React Router + TanStack Query
e2e/        Playwright 端對端測試
docker-compose.yml   postgres + backend + frontend（backend 以唯讀掛載外部圖像來源）
specs/      四個 feature 的 spec / plan / tasks（001 帳號認證 … 004 儀表板匯出）
```

## 開發 port（憲章 X，避開本機已佔用的 5000/7000/5432/32222）

| 服務 | Host port |
|------|-----------|
| 前端 (Vite dev) | `5180` |
| 後端 (Node.js) | `3100` |
| PostgreSQL (Docker) | `5433` → 容器 `5432` |

生產經 **Cloudflared** 託管於 `https://your-domain.example.com`。

## 快速開始（feature 001）

```bash
npm install                       # 安裝 workspace 全部相依
docker compose up -d postgres     # 啟動 Postgres（5433）
cp backend/.env.example backend/.env   # 填入本機設定（勿提交真實祕密）

# backend/
npm run prisma:migrate -w backend       # 建立 Account / Session / AuditLog
npm run seed:bootstrap-admin -w backend # 冪等建立首位系統管理員（FR-020）

npm run dev -w backend            # http://localhost:3100
npm run dev -w frontend           # http://localhost:5180
```

詳見各 feature 的 `specs/00X-*/quickstart.md`。

## 測試（TDD，覆蓋率 ≥ 80% — 憲章 VII）

```bash
npm run test -w backend           # Vitest unit + supertest integration
npm run test:coverage -w backend  # 覆蓋率閘道
npm run test -w frontend          # Vitest + React Testing Library
npm run e2e                       # Playwright（需前後端啟動）
```

# Quickstart: Blueprint Catalog Ingestion (Feature 002)

Run and validate the catalog ingestion + read API end-to-end on localhost. Ports per constitution X: frontend `5180`, backend `3100`, Postgres `5433→5432`. This feature has **no UI**; you validate via the CLI report and the read API.

## Prerequisites

- Docker + docker-compose, Node 22, npm.
- The READ-ONLY source dir present locally at:
  `…/物理治療師/專案文件/04_運動圖解藍圖` (51 `.png`, 51 blueprint `.md`, `00_藍圖總索引與設計規範.md`).
- 001 (auth) available if you want to exercise authenticated reads; for pure ingestion validation you only need the backend + DB.

## 1. Environment

Create `backend/.env` (never commit secrets — constitution V; values validated at startup by `config/env.ts`):

```bash
DATABASE_URL="postgresql://app:app@localhost:5433/physical_image_eval?schema=public"
IMAGE_SOURCE_DIR="/path/to/image-source"
PORT=3100
```

`docker-compose.yml` mounts `IMAGE_SOURCE_DIR` into the backend container **read-only**:

```yaml
services:
  backend:
    volumes:
      - "${IMAGE_SOURCE_DIR}:/srv/source:ro"   # :ro enforces read-only (constitution II)
    environment:
      IMAGE_SOURCE_DIR: /srv/source
```

## 2. Start Postgres + apply migrations

```bash
docker compose up -d postgres            # exposes 5433 -> container 5432
cd backend && npm install
npx prisma migrate dev --name catalog    # creates Region/Blueprint/Panel/Diagnosis tables + enums
```

Verify the four tables exist and are empty:

```bash
npx prisma studio   # or: psql -h localhost -p 5433 -U app -d physical_image_eval -c "\dt"
```

## 3. Run the ingestion command

Dry-run first (parse + validate + report, **no writes**):

```bash
cd backend && npm run ingest -- --check
```

Then the real ingest (validate → single transaction snapshot-replace):

```bash
npm run ingest
```

Expected success report (zh-TW human-readable), exit code `0`:

```
✅ 匯入成功
  藍圖總數：51
  各區域：S=4 H=4 E=6 T=8 P=5 K=7 L=5 Y=12
  診斷對帳：134 = 對應到藍圖 128 + 轉介 6   （128 內含 已對應 與 通用處方模板，其細分非權威不變量）
  高風險：S4, T8, P1, P4, P5, K2, K3, K5, L3  （9 張，與既定集合一致）
  警示：<列出 時間提示/畫面視覺描述 為空 或 0 涵蓋診斷 的項目，若有>
```

## 4. Prove the acceptance criteria

### SC-001 / FR-002..FR-010 — correct catalog
```bash
psql -h localhost -p 5433 -U app -d physical_image_eval -c "SELECT count(*) FROM \"Blueprint\";"        # 51
psql -h localhost -p 5433 -U app -d physical_image_eval \
  -c "SELECT r.\"regionCode\", count(b.*) FROM \"Region\" r JOIN \"Blueprint\" b ON b.\"regionId\"=r.id GROUP BY 1 ORDER BY 1;"  # S4 H4 E6 T8 P5 K7 L5 Y12
psql ... -c "SELECT \"blueprintId\", count(*) FROM \"Panel\" GROUP BY 1 HAVING count(*)<>4;"             # 0 rows
psql ... -c "SELECT count(*) FROM \"Diagnosis\";"                                                        # 134
psql ... -c "SELECT \"blueprintId\" FROM \"Blueprint\" WHERE \"isHighRisk\" ORDER BY 1;"                # exactly S4,T8,P1,P4,P5,K2,K3,K5,L3
```

### SC-003 / FR-013 — idempotent re-run
```bash
npm run ingest          # run again on unchanged source
# Report shows diff: added=[] modified=[] removed=[]; row counts unchanged; no duplicates.
```

### SC-005 / FR-001 — source never written
```bash
# Snapshot source content hashes + mtimes before, run a (passing and a failing) ingest, snapshot after.
find "$IMAGE_SOURCE_DIR" -type f -exec stat -f '%m %N' {} \; | sort > /tmp/src_before.txt
npm run ingest; npm run ingest -- --check
find "$IMAGE_SOURCE_DIR" -type f -exec stat -f '%m %N' {} \; | sort > /tmp/src_after.txt
diff /tmp/src_before.txt /tmp/src_after.txt    # MUST be empty (0 changes)
```

### SC-002 / FR-011 — fail-fast, 0 rows on failure
Use a broken fixture tree (one invariant violated, e.g. a blueprint with 3 panels) under `backend/tests/fixtures/source/`:
```bash
IMAGE_SOURCE_DIR=backend/tests/fixtures/source/broken-3-panels npm run ingest ; echo "exit=$?"   # exit=1
psql ... -c "SELECT count(*) FROM \"Blueprint\";"   # unchanged from prior good catalog (no partial overwrite)
```
The report must name the failing invariant + the offending `blueprintId`/`panelIndex` (SC-004).

## 5. Validate the read API

Start the backend, log in via 001 to obtain the session cookie, then:

```bash
BASE=http://localhost:3100
curl -s --cookie "$COOKIE" $BASE/api/regions                 | jq '.meta.total'        # 8
curl -s --cookie "$COOKIE" $BASE/api/blueprints              | jq '.meta.total'        # 51
curl -s --cookie "$COOKIE" $BASE/api/blueprints/S1           | jq '.data.panels|length'  # 4
curl -s --cookie "$COOKIE" $BASE/api/blueprints/S1           | jq '.data.aiPrompt'     # null/absent (FR-020)
curl -s --cookie "$COOKIE" $BASE/api/blueprints/S4           | jq '.data.isHighRisk'   # true
curl -s --cookie "$COOKIE" -o /tmp/S1.png $BASE/api/blueprints/S1/image && file /tmp/S1.png  # PNG image data
curl -s $BASE/api/regions | jq '.error.code'                                            # "AUTH_REQUIRED" (no cookie)
```

## 6. Automated tests (TDD, ≥80% — constitution VII)

```bash
cd backend
npm test                 # Vitest: parser, index-parser, invariants, diff, id-region (unit) + catalog-api, ingestion (integration)
npm run test:coverage    # assert ≥ 80%
```

Key test groups:
- **unit/ingestion** — each fail-fast invariant has a red test driven by an each-broken fixture tree (FR-002..FR-010, FR-022).
- **integration/ingestion** — all-or-nothing transaction (0 rows on failure), idempotent re-run equivalence, source-unchanged assertion.
- **integration/catalog-api** — envelope shape, 401 without session, `aiPrompt` never present, image route streams `image/png` and rejects traversal.

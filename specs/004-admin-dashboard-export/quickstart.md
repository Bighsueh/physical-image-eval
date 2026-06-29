# Quickstart: 管理員儀表板與匯出（Admin Dashboard & Export, Feature 004）

Run and validate feature 004 end-to-end on localhost. Ports per constitution X: frontend
`5180`, backend `3100`, Postgres `5433→5432`. 004 adds **no migration** — it reads tables
owned by 001 (auth), 002 (catalog), and 003 (reviews). You validate the dashboard read API,
the CSV export, and the admin-only / read-only guarantees.

## Prerequisites

- Docker + docker-compose, Node 22, npm.
- **001** (auth) ingested/seeded: at least one `ADMIN` (bootstrap seed) and ≥ 2 `REVIEWER`
  accounts. 001's session middleware (`require-auth`, `require-role`) and `lib/envelope.ts`
  are available.
- **002** (catalog) ingested: 51 blueprints + `HIGH_RISK_BLUEPRINT_IDS` constant present
  (`npm run ingest`).
- **003** (review workflow) available so reviewers can submit reviews (the data 004 aggregates).
  For pure 004 validation you can instead seed `Review`/`PanelReview` fixtures directly.

## 1. Environment

004 introduces **no new env var**. Reuse `backend/.env` from 001/002:

```bash
DATABASE_URL="postgresql://app:app@localhost:5433/physical_image_eval?schema=public"
IMAGE_SOURCE_DIR="/path/to/image-source"
PORT=3100
# session/cookie/bootstrap-admin vars per 001
```

## 2. Start Postgres + bring schema up to date

```bash
docker compose up -d postgres            # exposes 5433 -> container 5432
cd backend && npm install
npx prisma migrate dev                   # applies 001+002+003 migrations (004 adds none)
npm run seed:bootstrap-admin             # first ADMIN (001)
npm run ingest                           # 002 catalog (51 blueprints)
```

## 3. Seed reviewers + a mix of submitted / draft / 非在職 data

Use 003's UI or an e2e seed helper to create the state the acceptance scenarios need:

- 3 **active** reviewers; together they have **40 submitted** reviews and **7 drafts**.
- 1 reviewer **disabled after submitting 8** (becomes 非在職; rows preserved — 001 FR-008).
- At least one blueprint (e.g. `K3`, high-risk) with **disagreement** (one 通過, one 需重做).

```bash
cd backend && npm run seed:dashboard-fixtures   # e2e-helper: reviewers + submitted/draft/非在職 reviews
```

## 4. Start the app

```bash
# backend (3100)
cd backend && npm run dev
# frontend (5180)
cd frontend && npm run dev
```

Log in as the ADMIN to obtain the session cookie (001 `POST /api/auth/login`); capture it:

```bash
BASE=http://localhost:3100
COOKIE="pie_sid=...; pie_csrf=..."   # from the login Set-Cookie
```

## 5. Prove the acceptance criteria (read API)

### US1 / FR-002,016,022 — overall completion on the active basis
```bash
curl -s --cookie "$COOKIE" $BASE/api/admin/dashboard/overview | jq '{submittedActive,expectedSubmissions,percent,inactiveSubmittedTotal}'
# expectedSubmissions = activeReviewers(3) × 51 = 153 ; submittedActive = 40 ; percent ≈ 26.1
# inactiveSubmittedTotal = 8  (NOT in the 40 — separate; ratio never > 100 — FR-002/016)
```

### US1 / FR-003,004 — per-reviewer progress, unreviewed list, last submit
```bash
curl -s --cookie "$COOKIE" $BASE/api/admin/dashboard/reviewers \
  | jq '.data[0] | {displayName,isActive,submittedCount,unreviewed:(.unreviewedBlueprintIds|length),lastSubmittedBlueprintId,lastSubmittedAt}'
# submittedCount + unreviewed == 51 ; lastSubmitted* reflect newest submission
```

### US1 / FR-005,006 — per-image coverage + distribution (drafts excluded)
```bash
curl -s --cookie "$COOKIE" $BASE/api/admin/dashboard/images | jq '.meta.total'   # 51
curl -s --cookie "$COOKIE" $BASE/api/admin/dashboard/images \
  | jq '.data[] | select(.blueprintId=="S1") | {submittedActiveCount,missing:(.missingReviewers|length),fullCoverage,distribution}'
# A blueprint with only a draft shows submittedActiveCount unchanged by that draft (FR-007)
```

### US1 / FR-008,018 — drill-down surfaces disagreement (no mediation)
```bash
curl -s --cookie "$COOKIE" $BASE/api/admin/dashboard/images/K3 | jq '{hasDisagreement, rows:[.data.rows[]|{displayName,isActive,overallJudgement,indicationJudgement}]}'
# hasDisagreement=true ; rows list each submitter side-by-side ; 非在職 row flagged ; no merge field
curl -s --cookie "$COOKIE" $BASE/api/admin/dashboard/images/ZZ9 | jq '.error.code'   # "BLUEPRINT_NOT_FOUND"
```

### US3 / FR-009,010,011 — filters (high-risk, 含需重做, 未達全覆蓋)
```bash
curl -s --cookie "$COOKIE" "$BASE/api/admin/dashboard/images?hasRedo=true"        | jq '[.data[].blueprintId]'   # all ≥1 需重做, none missing (SC-003)
curl -s --cookie "$COOKIE" "$BASE/api/admin/dashboard/images?highRisk=true"       | jq '[.data[].blueprintId]'   # ⊆ {S4,T8,P1,P4,P5,K2,K3,K5,L3}
curl -s --cookie "$COOKIE" "$BASE/api/admin/dashboard/images?notFullyCovered=true"| jq '.meta.returned'          # count of images missing ≥1 active reviewer (SC-001)
```

## 6. Prove the CSV export (US2 / FR-013..017,020)

```bash
curl -s --cookie "$COOKIE" -o /tmp/export.csv -D - "$BASE/api/admin/export/reviews.csv" | grep -i 'content-type\|content-disposition'
# Content-Type: text/csv; charset=utf-8   |   Content-Disposition: attachment; filename="review-export-...csv"

# BOM present (EF BB BF)
head -c 3 /tmp/export.csv | xxd            # 00000000: efbb bf

# Header row = 27 fixed zh-TW columns (D4)
sed -n '1p' /tmp/export.csv

# Exactly the submitted rows, 0 drafts (40 data rows for the fixture above) — FR-007/015, SC-002
echo $(($(wc -l < /tmp/export.csv) - 1))   # 40

# A 乾淨通過 record still has all 16 panel columns present (empty), not missing — FR-015
# An injection attempt in a free-text note is neutralized (leading ' ) — FR-020
grep -n "^'=" /tmp/export.csv || echo "no raw formula cell escaped form check via unit test"
```

Open `/tmp/export.csv` in Excel (zh-TW) — 繁體中文 renders correctly thanks to the BOM, and
multi-select cells read as `骨鬆注意|缺安全提醒` (pipe-delimited).

## 7. Prove admin-only + read-only (US4 / FR-001,012, SC-007)

```bash
# Unauthenticated → 401 AUTH_REQUIRED
curl -s $BASE/api/admin/dashboard/overview | jq '.error.code'                    # "AUTH_REQUIRED"

# Reviewer session → 403 FORBIDDEN_ROLE (log in as a REVIEWER to get REVIEWER_COOKIE)
curl -s --cookie "$REVIEWER_COOKIE" $BASE/api/admin/dashboard/overview | jq '.error.code'   # "FORBIDDEN_ROLE"
curl -s --cookie "$REVIEWER_COOKIE" $BASE/api/admin/export/reviews.csv  | jq '.error.code'   # "FORBIDDEN_ROLE"

# No write path exists: there is NO POST/PUT/PATCH/DELETE under /api/admin/dashboard|export
# Review data is byte-identical before/after dashboard+export use (read-only projection)
psql -h localhost -p 5433 -U app -d physical_image_eval -c "SELECT md5(string_agg(id||status||\"submittedAt\"::text, ',' ORDER BY id)) FROM \"Review\";" > /tmp/rev_before.txt
curl -s --cookie "$COOKIE" $BASE/api/admin/dashboard/overview >/dev/null
curl -s --cookie "$COOKIE" -o /dev/null "$BASE/api/admin/export/reviews.csv"
psql -h localhost -p 5433 -U app -d physical_image_eval -c "SELECT md5(string_agg(id||status||\"submittedAt\"::text, ',' ORDER BY id)) FROM \"Review\";" > /tmp/rev_after.txt
diff /tmp/rev_before.txt /tmp/rev_after.txt   # MUST be empty (no mutation — SC-007)
```

## 8. Empty-state (FR-021, SC-010)

On a DB with reviewers but **0 submitted** reviews (or 0 reviewers):

```bash
curl -s --cookie "$COOKIE" $BASE/api/admin/dashboard/overview | jq '{submittedActive,expectedSubmissions,percent}'   # percent:0, no error
curl -s --cookie "$COOKIE" -o /tmp/empty.csv "$BASE/api/admin/export/reviews.csv"
echo $(($(wc -l < /tmp/empty.csv)))   # 1 (header only) + BOM ; no error
```

## 9. Automated tests (TDD, ≥ 80% — constitution VII)

```bash
cd backend
npm test                 # Vitest: completion-ratio, csv-serializer (RFC-4180 + BOM + injection),
                         #         multiselect-encode, disagreement, empty-state (unit)
                         #         + supertest: 5 routes, 401/403, filters, draft-exclusion, CSV bytes (integration)
npm run test:coverage    # assert ≥ 80%

cd ../frontend
npm test                 # Vitest + RTL: overview cards, reviewer/image tables, filters, HighRiskBadge, ExportButton

cd ..
npx playwright test e2e/admin-dashboard.spec.ts   # admin: overview → image filter → drill-down → CSV download; reviewer blocked 403
```

Key test groups:
- **unit/admin-dashboard** — active-basis ratio (incl. denominator 0 ⇒ percent 0; 非在職 never
  in numerator); CSV serializer feeds `=cmd|...`, `a,b"c`, newline notes ⇒ neutralized + escaped;
  multi-select encoder (empty set ⇒ empty cell); disagreement derivation.
- **integration/admin-dashboard** — envelope shape; `401` without session; `403` for reviewer;
  filter precision/recall; drafts excluded from every stat + export; 非在職 separated from active
  ratio; export header = 27 columns + BOM; review rows byte-identical after export (read-only).

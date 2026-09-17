# Quickstart: Reviewer Review Workflow (Feature 003)

Run and validate the review workflow end-to-end on localhost. Ports per constitution X:
frontend `5180`, backend `3100`, Postgres `5433→5432`. This feature depends on **001**
(auth/session/role) and **002** (catalog + read-only image route) already being present.

## Prerequisites

- Docker + docker-compose, Node 22, npm.
- 001 migrated + bootstrap admin seeded; 002 catalog ingested (all blueprints listed in the source index).
- The READ-ONLY source dir mounted for 002's image route, configured via
  `IMAGE_SOURCE_DIR` (conventionally the gitignored repo-root `images/`).

## 1. Environment

`backend/.env` (validated at startup; never commit secrets — constitution V):

```bash
DATABASE_URL="postgresql://app:app@localhost:5433/physical_image_eval?schema=public"
IMAGE_SOURCE_DIR="../images"   # absolute, or relative to the backend working directory (repo-root images/, gitignored)
PORT=3100
SESSION_COOKIE_SECURE=false   # dev; prod=true under Cloudflared (production domain)
```

`docker-compose.yml` already mounts `IMAGE_SOURCE_DIR` read-only and runs postgres + backend +
frontend; the frontend dev server proxies `/api` → `http://localhost:3100`.

## 2. Start services + apply the review migration

```bash
docker compose up -d postgres                 # 5433 -> container 5432
cd backend && npm install
npx prisma migrate dev --name review          # creates Review, PanelReview + 5 review enums
docker compose up -d backend frontend         # backend 3100, frontend 5180
```

Verify the two tables exist and are empty:

```bash
psql -h localhost -p 5433 -U app -d physical_image_eval -c '\dt' | grep -E 'Review|PanelReview'
```

## 3. Seed the actors (auth + catalog must exist first)

```bash
cd backend
npm run seed:bootstrap-admin                  # 001: first 系統管理員 (idempotent)
npm run ingest                                 # 002: blueprints, panels, high-risk flags
# create a reviewer via 001's admin API (returns a one-time temp password), then change it:
#   POST /api/admin/accounts { displayName:"林醫師", username:"dr.lin", role:"REVIEWER" }
```

## 4. Log in as the reviewer (cookie + CSRF)

```bash
BASE=http://localhost:3100
# login as dr.lin; capture cookies (pie_sid + pie_csrf)
curl -s -c /tmp/cj.txt -X POST $BASE/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"dr.lin","password":"<new-password>"}' | jq '.data.redirect'   # "/progress"
CSRF=$(grep pie_csrf /tmp/cj.txt | awk '{print $7}')
```

## 5. Prove the acceptance criteria (API)

### FR-039/041 · SC-009 — fresh progress is 0／N
```bash
curl -s -b /tmp/cj.txt $BASE/api/reviews/progress | jq '{submitted,draft,notStarted,total}'
# { "submitted": 0, "draft": 3? , "notStarted": ..., "total": <N> }  (0 submitted on a clean reviewer; N = blueprints in catalog)
```

### US1 / FR-004–FR-009 — open S1: full metadata, visualDescription shown, aiPrompt absent
```bash
curl -s -b /tmp/cj.txt $BASE/api/reviews/S1 | jq '.data.blueprint.panels[0].visualDescription'  # present
curl -s -b /tmp/cj.txt $BASE/api/reviews/S1 | jq '.data.blueprint | has("aiPrompt")'             # false
curl -s -b /tmp/cj.txt $BASE/api/reviews/S1 | jq '.data.review.panels | length'                  # 4 (empty template)
```

### US3 / FR-022–FR-026 · SC-002 — autosave a draft, then restore it
```bash
curl -s -b /tmp/cj.txt -X PATCH $BASE/api/reviews/S1 \
  -H "X-CSRF-Token: $CSRF" -H 'Content-Type: application/json' \
  -d '{"overallJudgement":null,"indicationJudgement":"合理","indicationNote":null,
       "panels":[{"panelIndex":1,"requiredWarnings":["注意跌倒"],"warningOther":"靠牆較安全",
                  "problemTypes":[],"problemNote":"第1格秒數疑似錯誤"},
                 {"panelIndex":2,"requiredWarnings":[],"warningOther":null,"problemTypes":[],"problemNote":null},
                 {"panelIndex":3,"requiredWarnings":[],"warningOther":null,"problemTypes":[],"problemNote":null},
                 {"panelIndex":4,"requiredWarnings":[],"warningOther":null,"problemTypes":[],"problemNote":null}]}' \
  | jq '.data.status'                                                   # "草稿" (never 已提交)
# restore: re-open and confirm orphan free-text survived (warningOther typed but 其它 NOT selected)
curl -s -b /tmp/cj.txt $BASE/api/reviews/S1 | jq '.data.review.panels[0].warningOther'   # "靠牆較安全" (FR-019)
curl -s -b /tmp/cj.txt $BASE/api/reviews/progress | jq '.data.submitted'                  # still 0 (draft not counted)
```

### US4 / FR-011 · SC-003 — submit without 整體判定 is blocked inline
```bash
curl -s -b /tmp/cj.txt -X POST $BASE/api/reviews/S1/submit \
  -H "X-CSRF-Token: $CSRF" -H 'Content-Type: application/json' \
  -d '{"overallJudgement":null,"indicationJudgement":null,"indicationNote":null,
       "panels":[{"panelIndex":1,"requiredWarnings":[],"warningOther":null,"problemTypes":[],"problemNote":null},
                 {"panelIndex":2,"requiredWarnings":[],"warningOther":null,"problemTypes":[],"problemNote":null},
                 {"panelIndex":3,"requiredWarnings":[],"warningOther":null,"problemTypes":[],"problemNote":null},
                 {"panelIndex":4,"requiredWarnings":[],"warningOther":null,"problemTypes":[],"problemNote":null}]}' \
  | jq '.error.code, .error.message'             # "OVERALL_JUDGEMENT_REQUIRED", "請先選擇整體判定"
```

### US2 / FR-018,FR-027 · SC-001,SC-004 — clean image: 通過 + all-empty panels submits + auto-advances
```bash
curl -s -b /tmp/cj.txt -X POST $BASE/api/reviews/S1/submit \
  -H "X-CSRF-Token: $CSRF" -H 'Content-Type: application/json' \
  -d '{"overallJudgement":"通過","indicationJudgement":null,"indicationNote":null,
       "panels":[{"panelIndex":1,"requiredWarnings":[],"warningOther":null,"problemTypes":[],"problemNote":null},
                 {"panelIndex":2,"requiredWarnings":[],"warningOther":null,"problemTypes":[],"problemNote":null},
                 {"panelIndex":3,"requiredWarnings":[],"warningOther":null,"problemTypes":[],"problemNote":null},
                 {"panelIndex":4,"requiredWarnings":[],"warningOther":null,"problemTypes":[],"problemNote":null}]}' \
  | jq '{status,next,completed,progress}'        # status "已提交", next "S2" (deterministic, skips 已提交)
```

### US3 / FR-026 · SC-006 — autosave never regresses a submitted review
```bash
curl -s -b /tmp/cj.txt -X PATCH $BASE/api/reviews/S1 \
  -H "X-CSRF-Token: $CSRF" -H 'Content-Type: application/json' \
  -d '{"overallJudgement":"通過","indicationJudgement":null,"indicationNote":null,
       "panels":[{"panelIndex":1,"requiredWarnings":[],"warningOther":null,"problemTypes":[],"problemNote":null},
                 {"panelIndex":2,"requiredWarnings":[],"warningOther":null,"problemTypes":[],"problemNote":null},
                 {"panelIndex":3,"requiredWarnings":[],"warningOther":null,"problemTypes":[],"problemNote":null},
                 {"panelIndex":4,"requiredWarnings":[],"warningOther":null,"problemTypes":[],"problemNote":null}]}' \
  | jq '.data.status'                            # still "已提交" (FR-026), not double-counted
```

### US6 / FR-033–FR-035 · SC-007 — high-risk flag is set for the 9 images, non-blocking
```bash
curl -s -b /tmp/cj.txt $BASE/api/reviews/S4 | jq '.data.blueprint.isHighRisk'   # true  (S4 in high-risk set)
curl -s -b /tmp/cj.txt $BASE/api/reviews/S1 | jq '.data.blueprint.isHighRisk'   # false (S1 not)
# The badge is icon+text in the UI (not color-only); submit on S4 is never blocked by it.
```

### US5 / FR-032 — reopen + edit + re-submit keeps one row, refreshes last-updated
```bash
curl -s -b /tmp/cj.txt $BASE/api/reviews/S1 | jq '{status:.data.review.status, submittedAt:.data.review.submittedAt}'
# re-submit with a changed field; submittedAt unchanged, lastUpdatedAt newer; still one (reviewer×blueprint) row.
```

### FR-031 / SC-005 — "繼續審查" lands on the deterministic next unreviewed
```bash
curl -s -b /tmp/cj.txt $BASE/api/reviews/next | jq '{next,completed,submitted,total}'   # next = first 未審 by displayOrder→numeric id
```

### FR-003 / SC-010 — per-reviewer isolation (reviewer B never sees A's review)
```bash
# log in a second reviewer (dr.wang) into /tmp/cj2.txt, then:
curl -s -b /tmp/cj2.txt $BASE/api/reviews/S1 | jq '.data.review.status'   # "未開始"/empty template — never A's draft
curl -s -b /tmp/cj2.txt $BASE/api/reviews/progress | jq '.data.submitted' # 0 — independent of A
```

### Role gate — an admin cannot reach review routes
```bash
# log in the 系統管理員 into /tmp/cj_admin.txt, then:
curl -s -b /tmp/cj_admin.txt $BASE/api/reviews/progress | jq '.error.code'   # "FORBIDDEN_ROLE" (constitution IV)
```

## 6. Validate the UI (Layout A) at http://localhost:5180

1. Log in as `dr.lin` → lands on `/progress` showing **已提交 0／N** (top, fixed).
2. Open S1 → left: sticky 2×2 PNG with **inline zoom/pan** (`+`/`-`/arrows/`0`, fit default,
   **no lightbox**) + full read-only metadata (適應症/練習次數/溫馨小叮嚀 + 4 panels'
   步驟名/動作說明/時間提示/**畫面視覺描述**); right: 整體判定 + 適應症 + 4 stacked panel forms.
3. **Keyboard-only clean path (SC-001/SC-011):** Tab to 整體判定, pick 通過, trigger submit —
   ≤ 15 s, no mouse; page auto-advances to the next unreviewed image.
4. Open S4 → **high-risk badge** (icon **and** text) is visible; filling/submitting is not blocked.
5. Progress page → filter by 區域＝膝(K) + 狀態＝未開始; click a 草稿 in the index → jumps to that
   blueprint with its draft restored.

## 7. Automated tests (TDD, ≥ 80% — constitution VII)

```bash
cd backend && npm test && npm run test:coverage     # Vitest unit + supertest integration ≥ 80%
cd ../frontend && npm test                          # Vitest + RTL: components, autosave hook, keyboard nav
npx playwright test e2e/review.spec.ts              # US1–US7 end-to-end
```

Key test groups:
- **unit/reviews** — `review-ordering` (displayOrder→numeric id, skip 已提交, N/N), status
  machine (no elevate / no regress), per-reviewer isolation, zod schema (4 panels, enum
  members, length caps), orphan-text preservation, enum↔zh-TW mapping.
- **integration/reviews** — all 5 routes incl. `401` (no session), `403` (admin role / CSRF),
  `400 OVERALL_JUDGEMENT_REQUIRED`, autosave-no-regress, cross-reviewer isolation, restore
  fidelity, `aiPrompt` never present.
- **e2e/review.spec.ts** — US1 圖文並陳, US2 鍵盤快路徑 (≤15s), US3 autosave 還原 + 不回退,
  US4 提交需整體判定 + 自動前進 + N/N, US5 重開修訂, US6 高風險警示, US7 個人進度頁.

---

# Amendment 2026-08-27 — 參考照片與標註的驗證步驟

Run these **after** the steps above (you need a logged-in reviewer with `pie_sid` + `pie_csrf`).
`$B` = a blueprint code, `$CSRF` = the CSRF cookie value. Sample images: any JPEG will do for
`original`/`display`; use a real `.heic` for the HEIC path.

## 0. Apply the additive migration and prove it changed nothing

```bash
# BEFORE: snapshot every existing review row (SC-017 baseline)
docker compose exec -T postgres psql -U pie -d physical_image_eval -Atc \
  "COPY (SELECT r.\"reviewerId\", r.\"blueprintCode\", r.\"overallJudgement\", r.\"indicationJudgement\",
                r.\"indicationNote\", r.\"otherComment\", r.status, r.\"submittedAt\",
                p.\"panelIndex\", p.\"noProblem\", p.\"requiredWarnings\", p.\"warningOther\",
                p.\"problemTypes\", p.\"problemNote\"
         FROM \"Review\" r LEFT JOIN \"PanelReview\" p ON p.\"reviewId\" = r.id
         ORDER BY 1,2,9) TO STDOUT" > /tmp/reviews-before.tsv

npm run prisma:migrate -w backend        # two CREATE TABLE only — expect zero ALTER

# AFTER: same query, must be byte-identical (SC-017)
docker compose exec -T postgres psql -U pie -d physical_image_eval -Atc "…same COPY…" \
  > /tmp/reviews-after.tsv
diff /tmp/reviews-before.tsv /tmp/reviews-after.tsv && echo "SC-017 OK: 0 differing rows"

# the migration must touch no existing table (FR-060)
grep -icE '^\s*alter table' backend/prisma/migrations/*_review_photo/migration.sql   # expect 0
```

## 1. FR-045/FR-050 — attaching a photo with no prior review creates a 草稿

```bash
curl -s -b cookies.txt -H "X-CSRF-Token: $CSRF" \
  -F original=@fixtures/hand.jpg -F display=@fixtures/hand-1600.jpg \
  -F panelIndex=1 -F caption='正確的收拳角度' \
  http://localhost:3100/api/reviews/$B/photos
# 201; data.reviewStatus == "草稿"; data.photo.panelIndex == 1
curl -s -b cookies.txt http://localhost:3100/api/reviews/progress   # submitted count UNCHANGED
```

## 2. FR-049/SC-014 — a photo alone makes a panel submittable

Mark panels 2–4 `noProblem`, leave panel 1 with **only** the photo (no `problemTypes`, no
text), then submit. Expect **200**, not `PANEL_REVIEW_INCOMPLETE`.

```bash
curl -s -b cookies.txt -H "X-CSRF-Token: $CSRF" -H 'Content-Type: application/json' \
  -X POST -d '{"overallJudgement":"需小修","panels":[
     {"panelIndex":1,"noProblem":false},{"panelIndex":2,"noProblem":true},
     {"panelIndex":3,"noProblem":true},{"panelIndex":4,"noProblem":true}]}' \
  http://localhost:3100/api/reviews/$B/submit
```

**Race check (research D15)**: upload a photo to panel 3 and submit **immediately** (before the
800 ms document debounce could fire) with panel 3 otherwise blank — must still be 200. This is
the case a document-only gate gets wrong.

## 3. FR-051/SC-015 — adding a photo to a submitted review does not regress it

```bash
# note submittedAt, then attach another photo
curl -s -b cookies.txt -H "X-CSRF-Token: $CSRF" -F original=@fixtures/b.jpg \
  -F display=@fixtures/b-1600.jpg -F panelIndex=2 http://localhost:3100/api/reviews/$B/photos
curl -s -b cookies.txt http://localhost:3100/api/reviews/$B
# status still 已提交; submittedAt UNCHANGED; lastUpdatedAt refreshed; no re-submit required
```

## 4. FR-052/SC-012 — the original survives annotation

```bash
curl -s -b cookies.txt -H "X-CSRF-Token: $CSRF" -X PUT \
  -F annotated=@fixtures/hand-annotated.jpg -F 'annotationState=@fixtures/state.json;type=application/json' \
  http://localhost:3100/api/reviews/$B/photos/$PID/annotation

# all three variants resolve, and the original is byte-identical to what was uploaded
for v in original display annotated; do
  curl -s -b cookies.txt -o /tmp/$v.bin "http://localhost:3100/api/reviews/$B/photos/$PID/file?variant=$v"
done
cmp fixtures/hand.jpg /tmp/original.bin && echo "SC-012 OK: original untouched"
```

## 5. FR-056/SC-019 — annotation state round-trips

```bash
curl -s -b cookies.txt http://localhost:3100/api/reviews/$B/photos/$PID/annotation
# data.annotationState deep-equals what was PUT — this is what lets the editor re-open it
```

## 6. FR-057/SC-016 — cross-reviewer isolation

As **another** reviewer, request the same photo id on every photo route. Expect **404
`PHOTO_NOT_FOUND`** every time (never 403 — the two must be indistinguishable, or the error
code itself confirms the photo exists).

## 7. FR-059 — reset removes photos and their bytes

```bash
curl -s -b cookies.txt -H "X-CSRF-Token: $CSRF" -X POST http://localhost:3100/api/reviews/$B/reset
docker compose exec -T postgres psql -U pie -d physical_image_eval -Atc \
  'SELECT count(*) FROM "ReviewPhotoBlob" b LEFT JOIN "ReviewPhoto" p ON p.id=b."photoId" WHERE p.id IS NULL'
# expect 0 — no orphan bytes
```

## 8. FR-061/SC-020 — a full store blocks photos only

Set the ceiling below current usage, then:

```bash
# upload → 409 PHOTO_STORAGE_FULL
# but ALL of these must still succeed:
curl -s -b cookies.txt -H "X-CSRF-Token: $CSRF" -X PATCH -H 'Content-Type: application/json' \
  -d '{"overallJudgement":"通過","panels":[…]}' http://localhost:3100/api/reviews/$B   # autosave 200
curl -s -b cookies.txt -H "X-CSRF-Token: $CSRF" -X POST  …/submit                      # submit  200
curl -s -b cookies.txt -H "X-CSRF-Token: $CSRF" -X DELETE …/photos/$PID                # delete  200
curl -s -b cookies.txt "…/photos/$PID2/file?variant=display"                           # view    200
```

## 9. SC-018 — the photo-free flow is unchanged

Re-run the **pre-existing** 003 suites without editing them:

```bash
npm run test -w backend -- tests/integration/reviews tests/unit/reviews
npx playwright test e2e/review.spec.ts
```

Both must pass unmodified. Any test that needs changing to accommodate photos is a signal the
change was not additive.

## 10. Browser-side checks (no curl equivalent)

- **HEIC on desktop Chrome** (research D16): pick a `.heic` from the file dialog — the WASM
  decoder lazy-loads, the 「準備中」 state shows, and what reaches the server is a JPEG
  `display` part plus the untouched HEIC `original`.
- **HEIC on iOS Safari**: same flow, decoded natively, visibly faster.
- **Bundle check** (research D17): load the review workspace and confirm the Filerobot chunk is
  **not** fetched until 「標註」 is clicked.
- **No outbound calls** (research D17): with the editor open, the network panel shows zero
  requests to any non-same-origin host — `useBackendTranslations` must be off.

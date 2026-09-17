---
description: "Task list for feature 004 — 管理員儀表板與匯出（Admin Dashboard & Export）"
---

# Tasks: 管理員儀表板與匯出（Admin Dashboard & Export）

**Input**: Design documents from `/specs/004-admin-dashboard-export/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/dashboard-export-api.md, quickstart.md

**Prerequisite features**: **001** (accounts-auth — `ADMIN` role, `require-auth`/`require-role` middleware, `lib/envelope.ts` + `lib/errors.ts`, session cookie, `Account.isActive`), **002** (catalog — `Region`/`Blueprint`/`Panel`, `HIGH_RISK_BLUEPRINT_IDS` constant, read-only image route), **003** (reviewer-review-workflow — `Review`/`PanelReview` models + their indexes). 004 reuses 001/002/003's monorepo skeleton and **adds no monorepo setup**. 004 **owns no stored entity — no table, no enum, no Prisma migration** (it is a pure read-only projection of the review + catalog domains). Its Setup/Foundational only add feature-specific module scaffolding, shared constants, the read repository, and test fixtures.

**Tests**: REQUIRED (constitution VII — TDD, coverage ≥ 80%). For every user story, test tasks are listed BEFORE implementation tasks and **MUST be written first and FAIL (RED) before any implementation (GREEN)**. Vitest + supertest (backend), Vitest + React Testing Library (frontend), Playwright (E2E critical flows).

**Organization**: Tasks grouped by user story (priority order from spec). Sequential IDs `T001..` across the whole file.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on another unfinished task)
- **[Story]**: `US1`..`US4` traceability to the spec's user stories
- All paths are real monorepo paths: `backend/src/admin-dashboard/...`, `backend/tests/...`, `frontend/src/...`, `frontend/tests/...`, `e2e/...`

---

## Phase 1: Setup (feature-specific scaffolding only)

**Purpose**: Create the 004 module skeleton inside the existing monorepo (001 already established backend/ + frontend/ + docker-compose + tooling). **No migration, no new table, no new env var.**

- [ ] T001 [P] Create backend module skeleton dirs `backend/src/admin-dashboard/{routes,controllers,services,repositories,dto,csv,constants}/` with `.gitkeep` placeholders.
- [ ] T002 [P] Create frontend dirs `frontend/src/routes/admin/dashboard/`, `frontend/src/components/admin/dashboard/`, `frontend/src/api/` (admin entries), `frontend/src/lib/` with `.gitkeep` placeholders.
- [ ] T003 [P] Create test dirs `backend/tests/unit/admin-dashboard/`, `backend/tests/integration/admin-dashboard/`, `backend/tests/e2e-helpers/`, `frontend/tests/admin/dashboard/`, and a stub `e2e/admin-dashboard.spec.ts` (skipped placeholder).
- [ ] T004 [P] Confirm 004 requires **no** `prisma/schema.prisma` change: add a short note in `backend/src/admin-dashboard/README.md` documenting reliance on existing indexes `Review(reviewerId)`, `Review(blueprintId)`, `Review(reviewerId,status)`, unique `Review(reviewerId,blueprintId)` (003) and `Account(isActive)`+`role` (001); assert no migration is added by this feature.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared read layer, constants, route boundary, and test fixtures that EVERY user story depends on. **⚠️ No user story work can begin until this phase is complete.**

- [ ] T005 [P] Create `backend/src/admin-dashboard/constants/dashboard-constants.ts`: CSV delimiter (`,`), multi-select set delimiter (`|`), the fixed 27-column export header order (D4), 整體判定/適應症判定 zh-TW label maps, 在職/非在職 + 是/否 flag labels; **import** `HIGH_RISK_BLUEPRINT_IDS` from 002's `catalog-constants.ts` (single source — never re-declare). zh-TW enum labels verbatim per FR-019.
- [ ] T006 [P] Create read-only seed fixture helper `backend/tests/e2e-helpers/seed-dashboard-fixtures.ts` + `npm run seed:dashboard-fixtures`: 3 active reviewers (40 submitted + 7 drafts together), 1 reviewer disabled after 8 submissions (非在職, rows preserved), and ≥1 high-risk blueprint (e.g. `K3`) with disagreement (one 通過, one 需重做). Used by integration + E2E across all stories.
- [ ] T007 Write **failing** unit/integration test for the read repository in `backend/tests/integration/admin-dashboard/review-read.repository.test.ts`: asserts groupBy/count/findMany return submitted-only aggregates over `Review`/`PanelReview`/`Account`/`Blueprint`, drafts excluded, and that no method issues a write (RED).
- [ ] T008 Implement `backend/src/admin-dashboard/repositories/review-read.repository.ts`: **READ-ONLY** Prisma `groupBy`/`count`/`findMany` (no raw SQL, no write) — active reviewer count, submitted counts (active vs 非在職), per-blueprint × overallJudgement distribution, per-reviewer submitted blueprintIds + `max(submittedAt)`, submitted reviews with `panelReviews`+`reviewer`+`blueprint` for drill-down/export, and catalog blueprint+region listing. Makes T007 pass.
- [ ] T009 Mount the admin router boundary in the Express app (`backend/src/app.ts` + `backend/src/admin-dashboard/routes/admin.module.ts`): apply 001's `require-auth` + `require-role('ADMIN')` to `/api/admin/dashboard/*` and `/api/admin/export/*`, mount (initially empty) dashboard + export sub-routers, wire 404 `BLUEPRINT_NOT_FOUND` / 400 `INVALID_PARAM` / 500 `INTERNAL_ERROR` via `lib/errors.ts` + `lib/envelope.ts`. Reviewer/anon → 401/403 even before handlers exist (FR-001).
- [ ] T010 [P] Register the frontend admin dashboard route subtree (`frontend/src/routes/admin/dashboard/index.tsx` + nav entry in the admin layout) under React Router, guarded by 001's admin-only route guard + 001's TanStack Query client; pages added in later phases.

**Checkpoint**: Read repository, constants, guarded route boundary, and seed fixtures ready — user stories can begin.

---

## Phase 3: User Story 1 - 監看整體完成度、審查者進度與各圖覆蓋分佈 (Priority: P1) 🎯 MVP

**Goal**: Admin sees overall active-basis completion, per-reviewer progress (submitted/N, unreviewed list, last submit), per-image coverage + 整體判定 distribution, and per-image cross-reviewer drill-down surfacing disagreement. Endpoints 1–4. (FR-002/003/004/005/006/007/008/016/018/021/022/023)

**Independent Test**: Seed reviewers with a mix of submitted/draft/untouched + one 非在職; open dashboard; verify overall completion, per-reviewer progress, unreviewed lists, per-image coverage counts and 通過/需小修/需重做 distribution are all correct, drafts excluded, and drill-down lists each submitter side-by-side.

### Tests for User Story 1 (write FIRST — MUST FAIL before implementation) ⚠️

- [ ] T011 [P] [US1] Unit test `backend/tests/unit/admin-dashboard/completion-ratio.test.ts`: active-basis numerator/denominator/percent; `expectedSubmissions = activeReviewers × totalBlueprints` (catalog count); denominator 0 ⇒ percent 0; 非在職 submissions NEVER in numerator; percent never > 100 (FR-002/016/022).
- [ ] T012 [P] [US1] Unit test `backend/tests/unit/admin-dashboard/progress-service.test.ts`: per-reviewer projection (submittedCount + unreviewedBlueprintIds = catalog blueprint count, last submit), per-image distribution counts active submitters only, `submittedActiveCount = Σ distribution`, disagreement derivation (`hasDisagreement` = distinct non-null overall > 1), and empty-state (0 reviewers / 0 submitted) (FR-003/004/005/006/008/022).
- [ ] T013 [P] [US1] Integration test `backend/tests/integration/admin-dashboard/overview.test.ts`: `GET /api/admin/dashboard/overview` envelope; 40 submitted / (3 active × catalog blueprint count) ⇒ matching percent; `inactiveSubmittedTotal` separate (not in `submittedActive`); empty-state percent 0, no error (FR-002/016/021/022).
- [ ] T014 [P] [US1] Integration test `backend/tests/integration/admin-dashboard/reviewers.test.ts`: `GET /api/admin/dashboard/reviewers` per-reviewer rows, unreviewed list length, last-submit blueprint+time; 0-submission reviewer ⇒ `submittedCount:0`, all catalog blueprints unreviewed, `lastSubmitted*: null`; ordering (active first, then 非在職) + `meta {total,activeCount,inactiveCount}` (FR-003/004/016).
- [ ] T015 [P] [US1] Integration test `backend/tests/integration/admin-dashboard/images.test.ts`: `GET /api/admin/dashboard/images` returns every catalog blueprint ordered by region `displayOrder` then numeric id; coverage `submittedActiveCount`, `missingReviewers`, `fullCoverage`, distribution; drafts excluded; `inactiveSubmittedCount` separate; 0-submitter edge; `meta {total,returned}` (FR-005/006/007/011/016).
- [ ] T016 [P] [US1] Integration test `backend/tests/integration/admin-dashboard/drilldown.test.ts`: `GET /api/admin/dashboard/images/:blueprintId` rows include all submitters (active + 非在職 flagged), `hasDisagreement`, drafts never appear, ≤1 row per reviewer; valid-shape unknown id ⇒ 404 `BLUEPRINT_NOT_FOUND`; bad shape ⇒ 400 `INVALID_PARAM`; 0-submitter ⇒ `rows:[]` (FR-007/008/018/023).
- [ ] T017 [P] [US1] Frontend RTL test `frontend/tests/admin/dashboard/dashboard-views.test.tsx`: `CompletionSummary` (active ratio + 非在職 separate line), `ReviewerProgressTable`, `ImageCoverageTable`, `JudgementDistribution`, `CrossReviewerTable` render projection data; 非在職 rows labelled; empty-state renders without error.

### Implementation for User Story 1

- [ ] T018 [P] [US1] Implement `backend/src/admin-dashboard/services/completion-ratio.ts`: pure active-basis numerator/denominator/percent helper (denominator 0 ⇒ 0; never > 100). Makes T011 green.
- [ ] T019 [P] [US1] Implement `backend/src/admin-dashboard/dto/dashboard.dto.ts`: overview / reviewer / image / drill-down DTO builders; HTML-escape/sanitize `displayName`, `indicationNote` and panel notes on JSON output; never emit `aiPrompt`/hashes/tokens (constitution V, FR-020).
- [ ] T020 [US1] Implement `backend/src/admin-dashboard/services/progress.service.ts`: build `OverallProgress`, `ReviewerProgress[]`, `ImageProgress[]`, and `ImageDrillDown` projections (pure functions, immutable); active basis; 非在職 surfaced separately; disagreement derivation; ordering. Depends on T008, T018, T019. Makes T012 green.
- [ ] T021 [US1] Implement `backend/src/admin-dashboard/controllers/admin-dashboard.controller.ts`: envelope-wrap overview/reviewers/images/drill-down service output; `meta` for list endpoints; 404 `BLUEPRINT_NOT_FOUND` for unknown drill-down id. Depends on T020.
- [ ] T022 [US1] Implement `backend/src/admin-dashboard/routes/admin-dashboard.routes.ts`: 4 GET routes (`/overview`, `/reviewers`, `/images`, `/images/:blueprintId`) with zod path-param validation (`blueprintId` `^[SHETPKLY][1-9][0-9]?$`); register into the admin router from T009. Makes T013/T014/T015/T016 green.
- [ ] T023 [P] [US1] Implement `frontend/src/api/admin-dashboard.ts` (TanStack Query GET hooks for the 4 endpoints) and `frontend/src/lib/inactive-label.ts` (在職/非在職 label helper).
- [ ] T024 [P] [US1] Implement `frontend/src/routes/admin/dashboard/DashboardOverviewPage.tsx` + `frontend/src/components/admin/dashboard/CompletionSummary.tsx` (active ratio + 非在職 separate line + headline counts). Depends on T023.
- [ ] T025 [P] [US1] Implement `frontend/src/routes/admin/dashboard/ReviewerProgressPage.tsx` + `frontend/src/components/admin/dashboard/ReviewerProgressTable.tsx` (submitted/N, unreviewed list, last submit, 非在職 label). Depends on T023.
- [ ] T026 [P] [US1] Implement `frontend/src/routes/admin/dashboard/ImageCoveragePage.tsx` + `frontend/src/components/admin/dashboard/ImageCoverageTable.tsx` + `frontend/src/components/admin/dashboard/JudgementDistribution.tsx` (coverage + distribution; filters/export wired in later stories). Depends on T023.
- [ ] T027 [P] [US1] Implement `frontend/src/routes/admin/dashboard/ImageDrillDownPage.tsx` + `frontend/src/components/admin/dashboard/CrossReviewerTable.tsx` (per-reviewer 整體判定/適應症判定 side-by-side, disagreement surfaced, 非在職 flagged; v1 surface only, no mediation). Depends on T023. Makes T017 green.

**Checkpoint**: US1 fully functional — overview, reviewers, images, drill-down all work and are independently testable. MVP deliverable.

---

## Phase 4: User Story 2 - 匯出已提交審查結果以餵回修圖 (Priority: P1)

**Goal**: Admin exports every **submitted** (reviewer × image) record as CSV — 圖 ID/名稱/區域, 整體判定, 適應症判定+說明, 圖1..圖4 各自的警語/問題類型/問題說明, 提交時間 — drafts excluded, multi-select sets delimited, flags explicit, free text injection-neutralized, UTF-8+BOM. Endpoint 5. (FR-013/014/015/016/017/019/020)

**Independent Test**: With submitted + drafts present, export; verify exactly N submitted rows (0 drafts), every row carries all 27 columns (incl. four panels, even for 乾淨通過), enum values verbatim, and a special-char free-text cell is neutralized without breaking structure.

### Tests for User Story 2 (write FIRST — MUST FAIL before implementation) ⚠️

- [ ] T028 [P] [US2] Unit test `backend/tests/unit/admin-dashboard/multiselect-encode.test.ts`: 需要添加的警語/問題類型 sets → pipe-delimited zh-TW labels; empty set ⇒ empty cell (FR-015/017).
- [ ] T029 [P] [US2] Unit test `backend/tests/unit/admin-dashboard/csv-serializer.test.ts`: RFC-4180 quoting/escaping (comma, quote, newline), UTF-8 BOM (`EF BB BF`) prepended, CRLF line endings, and formula-injection neutralization (leading `= + - @ \t \r` prefixed with `'`) on every free-text cell (FR-020, SC-002 §4).
- [ ] T030 [P] [US2] Unit test `backend/tests/unit/admin-dashboard/export-service.test.ts`: submitted-only (0 drafts), includes active + 非在職 each flagged, exactly one row per (reviewer × image), 乾淨通過 record still emits all 16 panel columns (empty) (FR-007/015/016/023).
- [ ] T031 [P] [US2] Integration test `backend/tests/integration/admin-dashboard/export.test.ts`: `GET /api/admin/export/reviews.csv` headers (`Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="review-export-...csv"`), BOM bytes, 27-column fixed zh-TW header row, N submitted rows / 0 drafts, `hasRedo`/`highRisk` filters narrow rows but keep columns, empty-state ⇒ header-only CSV (FR-013/014/015/021).
- [ ] T032 [P] [US2] Frontend RTL test `frontend/tests/admin/dashboard/export-button.test.tsx`: `ExportButton` triggers the CSV download (GET → blob → save) and is keyboard-operable.

### Implementation for User Story 2

- [ ] T033 [P] [US2] Implement `backend/src/admin-dashboard/csv/multiselect-encode.ts`: delimited-list encoder for warning/problem sets (empty set ⇒ empty cell). Makes T028 green.
- [ ] T034 [P] [US2] Implement `backend/src/admin-dashboard/csv/csv-serializer.ts`: dependency-free RFC-4180 writer with UTF-8 BOM + CRLF + formula-injection guard. Makes T029 green.
- [ ] T035 [P] [US2] Implement `backend/src/admin-dashboard/dto/export-record.dto.ts`: one (reviewer × image) row shape over the fixed 27-column order; 在職/非在職, 高風險 是/否, 含需重做 是/否, ISO-8601 UTC 提交時間.
- [ ] T036 [US2] Implement `backend/src/admin-dashboard/services/export.service.ts`: build `ExportRecord[]` (submitted-only, active + 非在職 flagged, ≤1 row/pair, optional hasRedo/highRisk filters) from T008 using T033 + T005 constants. Makes T030 green.
- [ ] T037 [US2] Implement `backend/src/admin-dashboard/controllers/admin-export.controller.ts`: set CSV headers + timestamped filename, stream serialized body (T034); errors via JSON envelope. Depends on T034, T036.
- [ ] T038 [US2] Implement `backend/src/admin-dashboard/routes/admin-export.routes.ts`: `GET /export/reviews.csv` with zod query filters (`hasRedo`/`highRisk` → 400 `INVALID_PARAM` on bad value); register into the admin router from T009. Makes T031 green.
- [ ] T039 [P] [US2] Implement `frontend/src/api/admin-export.ts` (fetch → blob → save) + `frontend/src/components/admin/dashboard/ExportButton.tsx`, and wire `ExportButton` into `ImageCoveragePage.tsx` (T026). Makes T032 green.

**Checkpoint**: US1 + US2 both work independently — dashboard monitoring and CSV export deliverable.

---

## Phase 5: User Story 3 - 凸顯／篩選「需重做」與辨識高風險圖 (Priority: P2)

**Goal**: Admin filters images by 含需重做 / 高風險 / 尚未達全覆蓋 (combinable) and identifies high-risk images via a non-color-only badge. Extends endpoint 3 + image UI. (FR-009/010/011, SC-001/003/005)

**Independent Test**: Seed images with/without 需重做 and high-risk/non-high-risk; apply each filter; verify precision/recall 100% for 含需重做 and 尚未達全覆蓋, high-risk subset ⊆ {S4,T8,P1,P4,P5,K2,K3,K5,L3}, and the high-risk marker shows text/icon, not color alone.

### Tests for User Story 3 (write FIRST — MUST FAIL before implementation) ⚠️

- [ ] T040 [P] [US3] Integration test `backend/tests/integration/admin-dashboard/image-filters.test.ts`: `?hasRedo=true` keeps only ≥1 需重做 blueprints, `?highRisk=true` ⊆ HIGH_RISK set, `?notFullyCovered=true` keeps only blueprints missing ≥1 active reviewer; filters AND together; bad value ⇒ 400 `INVALID_PARAM`; `meta.returned` correct (FR-009/010/011).
- [ ] T041 [P] [US3] Frontend RTL test `frontend/tests/admin/dashboard/image-filters.test.tsx`: `ImageFilters` toggles (keyboard-operable) drive the query; `HighRiskBadge` renders icon + text (asserts not color-only) (FR-024).

### Implementation for User Story 3

- [ ] T042 [P] [US3] Implement `backend/src/admin-dashboard/services/image-filters.ts`: pure predicate module applying hasRedo/highRisk/notFullyCovered (ANDed) to `ImageProgress[]`.
- [ ] T043 [US3] Extend `backend/src/admin-dashboard/routes/admin-dashboard.routes.ts` + `progress.service.ts` images handler with a zod query schema (`hasRedo`/`highRisk`/`notFullyCovered` booleans) that applies T042 and sets `meta.returned`. Depends on T022, T042. Makes T040 green.
- [ ] T044 [P] [US3] Implement `frontend/src/components/admin/dashboard/HighRiskBadge.tsx`: icon + text marker, never color-only (FR-024). Makes the badge half of T041 green.
- [ ] T045 [US3] Implement `frontend/src/components/admin/dashboard/ImageFilters.tsx` (含需重做 / 高風險 / 尚未達全覆蓋, keyboard-operable) and wire it + `HighRiskBadge` into `ImageCoveragePage.tsx` (T026) / `ImageCoverageTable.tsx`. Makes T041 green.

**Checkpoint**: US1 + US2 + US3 work independently — filtering and high-risk identification deliverable.

---

## Phase 6: User Story 4 - 儀表板對審查資料唯讀 (Priority: P2)

**Goal**: No interaction or entry on the dashboard/export can create, modify, or delete any reviewer's 整體判定/適應症判定/分格註記/草稿; every route is admin-only and GET-only; review data is byte-identical before/after use. (FR-001/012/020, SC-007)

**Independent Test**: As admin, attempt to alter any review via every dashboard interaction — none exists; assert no POST/PUT/PATCH/DELETE is registered under `/api/admin/dashboard|export`; and `Review`/`PanelReview` are byte-identical before/after dashboard + export. As reviewer/anon, every route → 403/401.

### Tests for User Story 4 (write FIRST — MUST FAIL before implementation) ⚠️

- [ ] T046 [P] [US4] Integration test `backend/tests/integration/admin-dashboard/access-control.test.ts`: all 5 routes return 401 `AUTH_REQUIRED` with no session and 403 `FORBIDDEN_ROLE` for a `REVIEWER` session (FR-001, SC-007).
- [ ] T047 [P] [US4] Integration test `backend/tests/integration/admin-dashboard/read-only.test.ts`: assert no POST/PUT/PATCH/DELETE route is registered under `/api/admin/dashboard|export`; and `Review`/`PanelReview` md5 snapshot is identical before/after calling overview + export (read-only projection — FR-012, SC-007).
- [ ] T048 [P] [US4] Unit test `backend/tests/unit/admin-dashboard/sanitize.test.ts`: free-text fields (`displayName`, 適應症說明, 警語其它, 問題說明) are HTML-escaped on JSON output and never break the envelope (FR-020).
- [ ] T049 [P] [US4] Frontend RTL test `frontend/tests/admin/dashboard/route-guard.test.tsx`: a `REVIEWER` session is blocked/redirected from `/admin/dashboard/*` and the admin nav is hidden for non-admin (defense-in-depth, FR-001).

### Implementation for User Story 4

- [ ] T050 [US4] Verify/lock the server boundary in `backend/src/admin-dashboard/routes/admin.module.ts`: both dashboard + export routers inherit `require-auth` + `require-role('ADMIN')`; only GET handlers registered; generic 500 `INTERNAL_ERROR` (no leakage); ensure `dashboard.dto.ts` sanitization (T019) covers every free-text field. Makes T046/T047/T048 green.
- [ ] T051 [P] [US4] Implement `frontend/src/routes/admin/dashboard/AdminDashboardGuard.tsx` (or extend T010 guard): admin-only access to the `/admin/dashboard` subtree (reviewer → redirect), hide admin nav for non-admin. Makes T049 green.

**Checkpoint**: All four user stories independently functional; read-only + admin-only guarantees verified.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: End-to-end critical-flow coverage, quality gates, accessibility, performance, docs.

- [ ] T052 [P] Playwright E2E `e2e/admin-dashboard.spec.ts`: admin flow overview → image filter → drill-down → CSV download; reviewer session blocked 403 on dashboard + export (uses T006 fixtures).
- [ ] T053 [P] Verify coverage ≥ 80% (`cd backend && npm run test:coverage`; `cd frontend && npm test -- --coverage`) — close gaps in unit/integration suites if below threshold (constitution VII).
- [ ] T054 [P] Accessibility pass: 高風險/含需重做/未達全覆蓋 badges carry icon+text (never color-only); overview/reviewer/image/drill-down + filters + export fully keyboard-operable with clear focus order (FR-024, constitution IX).
- [ ] T055 [P] Performance check on seeded corpus: overview/images p95 < 150 ms, drill-down p95 < 100 ms, full CSV export < 1 s (plan Performance Goals).
- [ ] T056 Run `quickstart.md` validation end-to-end: curl all 5 endpoints + filters, confirm BOM/27-column header, draft exclusion, empty-state, and the read-only md5 before/after diff is empty (SC-002/007/010).
- [ ] T057 [P] Update `backend/src/admin-dashboard/README.md` + feature docs: endpoint list, CSV column dictionary, active-basis rule, and 非在職 separation notes.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependency — can start immediately (assumes 001/002/003 already in the repo).
- **Foundational (Phase 2)**: Depends on Setup. **BLOCKS all user stories.** T008 depends on T007 (RED-first); T009 depends on 001 middleware/envelope; T010 depends on 001 frontend router/guard.
- **User Story 1 (Phase 3, P1)**: Depends on Foundational. No dependency on US2/US3/US4.
- **User Story 2 (Phase 4, P1)**: Depends on Foundational (repository T008, constants T005). Independent of US1 logic; only frontend T039 wires into US1's `ImageCoveragePage` (T026).
- **User Story 3 (Phase 5, P2)**: Depends on Foundational + US1's images endpoint (T022) and image page (T026), which it extends with filters/badges.
- **User Story 4 (Phase 6, P2)**: Depends on Foundational + all routes existing (US1 T022, US2 T038) to assert admin-only/read-only across the full surface.
- **Polish (Phase 7)**: Depends on all targeted user stories being complete.

### Within Each User Story

- **Tests FIRST** (RED) before implementation (GREEN) — non-negotiable (constitution VII).
- Order: tests → constants/DTO/pure helpers → repository (foundational) → services → controllers → routes → frontend integration.
- US1: T011–T017 → T018/T019 → T020 → T021 → T022 → T023 → T024–T027.
- US2: T028–T032 → T033/T034/T035 → T036 → T037 → T038 → T039.
- US3: T040/T041 → T042 → T043 → T044 → T045.
- US4: T046–T049 → T050 → T051.
- A story is complete (checkpoint passes) before moving to the next priority.

### Cross-story file touch-points (sequential, not parallel)

- `frontend/src/routes/admin/dashboard/ImageCoveragePage.tsx`: created in T026 (US1), extended by T039 (US2 export button) and T045 (US3 filters/badges) — keep these edits sequential.
- `backend/src/admin-dashboard/routes/admin-dashboard.routes.ts` + `progress.service.ts`: created in US1, extended by T043 (US3 filters).
- `backend/src/admin-dashboard/dto/dashboard.dto.ts`: sanitization implemented in T019 (US1), verified/locked in T050 (US4).

## Parallel Opportunities

- **Phase 1**: T001, T002, T003, T004 all `[P]` (different dirs/files).
- **Phase 2**: T005 and T006 `[P]`; T010 `[P]` (frontend) runs alongside backend T007→T008→T009 chain.
- **US1 tests**: T011–T017 all `[P]` (separate test files) — launch together.
- **US1 impl**: T018 + T019 `[P]`; after T023, frontend pages T024/T025/T026/T027 `[P]` (separate files).
- **US2 tests**: T028–T032 all `[P]`.
- **US2 impl**: T033 + T034 + T035 `[P]`; T039 `[P]` (frontend).
- **US3**: T040 + T041 `[P]`; T042 + T044 `[P]`.
- **US4 tests**: T046–T049 all `[P]`; T051 `[P]` (frontend) alongside backend T050.
- **Polish**: T052, T053, T054, T055, T057 `[P]`; T056 (quickstart) runs last after the others.
- **Cross-story**: once Foundational completes, US1 (P1) and US2 (P1) can be built in parallel by separate developers (shared read repository T008 already done); US3/US4 (P2) follow once the routes/pages they extend exist.

---

## Notes

- 004 writes **nothing**: no table, no enum, no migration, no POST/PUT/PATCH/DELETE — every endpoint is GET and the export is a pure projection (constitution XI, FR-012, SC-007).
- Active basis is the single source of truth for the three headline numbers; 非在職 submissions are surfaced separately and never enter the active numerator (FR-002/016/022).
- All zh-TW enum labels/headers are verbatim per FR-019; `error.code` stays machine-English, `error.message` zh-TW (constitution VIII).
- `[P]` = different files, no dependency on an unfinished task. Verify each story's tests FAIL before implementing. Commit after each task or logical group.

---

# Amendment 2026-08-27 — 參考照片的管理端呈現（US5）

Continues the numbering above (T058+). Same rules: `[P]` = different files; **tests first
(RED) before implementation**; every task names a real path.

**Prerequisite**: 003's photo tables must exist (003 T090). 004 still adds **no table, no
migration, no mutation** — every task below is read-only.

## Phase 8: Foundational — 唯讀照片存取（Blocking）

- [X] T058 Add `PHOTO_NOT_FOUND`（找不到該照片）to `backend/src/lib/errors.ts` **only if 003 T086 has not already added it** (003 T086 owns this code; this task is a no-op when 003 lands first — sequence 003 T086 before this) — a photo whose review is not `已提交` MUST return this, indistinguishable from an unknown id (FR-028)
- [X] T059 [P] Write unit test `backend/tests/unit/admin-dashboard/photos/work-table.test.ts` — grouping into exactly four `PanelGroup`s in index order even when empty; `allClear` true only when every submitting reviewer marked that panel 無問題; `flaggedReviewerCount` and `photoCount` derivation; `panelIndex = NULL` photos land in `imageLevelEntries` — MUST fail first (RED)
- [X] T060 [P] Write unit test `backend/tests/unit/admin-dashboard/photos/bundle-naming.test.ts` — in-archive names encode 圖 × 分格 × 審查者 × 版本別; `panelIndex = NULL` renders as 整體; composition includes original + annotated but **never** the display derivative; a HEIC original with no annotated version is substituted by `originalAsJpeg` (FR-030, research D12) — MUST fail first (RED)
- [X] T061 [P] Write unit test `backend/tests/unit/admin-dashboard/photos/storage-usage.test.ts` — `usedPercent` arithmetic; `warning` transitions none→approaching at 80 %→full at 100 %; usage **includes draft photos** (the documented exception) — MUST fail first (RED)
- [X] T062 [P] Write unit test `backend/tests/unit/admin-dashboard/photos/export-photo-columns.test.ts` — the two appended columns use the same delimited-set encoding as other multi-value columns (D4), and go through RFC-4180 escaping + formula-injection neutralization (D5); a filename starting with `=` is neutralized — MUST fail first (RED)
- [X] T063 Implement `backend/src/admin-dashboard/repositories/photo-read.repository.ts` — **every query starts from `Review` filtered to `已提交`** and joins outward; no query may start from `ReviewPhoto`. This single choke point is what makes FR-028 structural (research D10) — depends on 003 T090

**Checkpoint**: the submitted-only join point exists; every downstream service inherits the draft exclusion.

---

## Phase 9: User Story 5 - 修圖工作台 (Priority: P1)

**Goal**: per-image work table, photo count column + filter, per-image bundle, storage panel — all read-only.

### Tests (write first — RED)

- [X] T064 [P] `backend/tests/integration/admin-dashboard/photos/worktable.test.ts` — route 6 returns four panels in index order with counts, entries and `allClear`; 非在職 reviewers' submitted entries present and flagged; a blueprint with 0 submitted reviews returns 200 with zeros, not an error (FR-021/FR-026/FR-027/SC-011)
- [X] T065 [P] `backend/tests/integration/admin-dashboard/photos/draft-exclusion.test.ts` — **the load-bearing test**: with a draft review carrying photos, assert 0 leakage across all four surfaces — work table entries, `photoCount`, `photos.zip` contents, and the CSV (FR-028/SC-012)
- [X] T066 [P] `backend/tests/integration/admin-dashboard/photos/file-route.test.ts` — route 7 serves each variant with the stored content type; a **draft** photo's id returns 404 `PHOTO_NOT_FOUND` identical to an unknown id; `annotated` on an un-annotated photo is 404
- [X] T067 [P] `backend/tests/integration/admin-dashboard/photos/bundle.test.ts` — route 8 returns `application/zip` with the expected entry count and names; a blueprint with no submitted photos returns a valid **empty** archive with 200; no temp file is left behind (research D12)
- [X] T068 [P] `backend/tests/integration/admin-dashboard/photos/storage.test.ts` — route 9 shape and thresholds; the number matches a direct `SUM` over `ReviewPhoto` byte columns. **Plus FR-037's second clause**: with the ceiling lowered below current usage, the work table (route 6), the file route (7), the bundle (8) and the CSV export all still return 200 — the ceiling constrains 003's upload path **only** and must never degrade an admin read path
- [X] T069 [P] `backend/tests/integration/admin-dashboard/photos/has-photos-filter.test.ts` — `images?hasPhotos=true` never returns a blueprint whose `photoCount` is 0, and never omits one whose count is ≥ 1 (FR-031)
- [X] T070 [P] `backend/tests/integration/admin-dashboard/photos/read-only.test.ts` — POST/PUT/PATCH/DELETE against every new photo route return 404/405; no mutating photo route exists (FR-036/SC-016)
- [X] T071 [P] `backend/tests/integration/admin-dashboard/photos/export-append.test.ts` — the previous CSV header is a **strict prefix** of the new one and every pre-existing column's values are byte-identical for the same rows (FR-035/SC-014); each row's filenames match the bundle's contents (SC-015)
- [X] T072 [P] `backend/tests/integration/admin-dashboard/photos/role.test.ts` — a REVIEWER session gets 403 on all four new routes; anonymous gets 401

### Implementation

- [X] T073 Implement `backend/src/admin-dashboard/services/work-table.service.ts` — builds `ImageWorkTable` from T063's repository (makes T059/T064 pass) — depends on T063
- [X] T074 Implement `backend/src/admin-dashboard/services/photo-bundle.service.ts` — naming + composition rules, **streamed** ZIP with no temp file (makes T060/T067 pass) — depends on T063
- [X] T075 Implement `backend/src/admin-dashboard/services/photo-storage.readonly.ts` — `SUM` over `ReviewPhoto` byte columns, thresholds (makes T061/T068 pass)
- [X] T076 Implement `backend/src/admin-dashboard/csv/export-photo-columns.ts` — the two appended columns **only**; do not touch the existing serializer (makes T062/T071 pass)
- [X] T077 Implement `backend/src/admin-dashboard/controllers/admin-photo.controller.ts` and register routes 6–9 on `admin-dashboard.routes.ts` behind the existing `adminReadRateLimiter` + `requireAuth` + `requireRole('ADMIN')` + `requirePasswordCurrent` chain — **GET only, no CSRF** (makes T066/T070/T072 pass) — depends on T073, T074, T075
- [X] T078 Add `photoCount` to the per-image projection and the `hasPhotos` boolean query flag to `backend/src/admin-dashboard/services/image-filters.ts` + `validation/dashboard.schema.ts` (makes T069 pass) — depends on T063
- [X] T079 [P] Implement `frontend/src/components/admin/dashboard/PanelGroup.tsx` — header counts, collapsed all-clear line, expandable entries
- [X] T080 [P] Implement `frontend/src/components/admin/dashboard/ReviewerEntry.tsx` — judgement pills, problem annotations, photo thumbnails, per-entry download
- [X] T081 [P] Implement `frontend/src/components/admin/dashboard/BundleDownloadButton.tsx` — 下載本圖全部材料
- [X] T082 [P] Implement `frontend/src/components/admin/dashboard/PhotoCountCell.tsx` and add the 附照片 column + 只看有附照片 chip to `ImageCoverageTable.tsx` / `ImageFilters.tsx` (FR-031)
- [X] T083 [P] Implement `frontend/src/components/admin/dashboard/StorageUsagePanel.tsx` — 已用／上限 + percentage + 80 % warning as icon+text (FR-034, constitution IX)
- [X] T084 Rework `frontend/src/routes/admin/dashboard/ImageDrillDownPage.tsx` into the work table: blueprint on one side, `PanelGroup` × 4 + image-level entries on the other — depends on T079, T080, T081
- [X] T085 Extend `frontend/src/api/admin-dashboard.ts` — `worktable` / `storage` / bundle URL / `hasPhotos` filter
- [X] T086 `e2e/admin-photos.spec.ts` — US5: open the work table → confirm a draft reviewer's photos are absent → download the bundle → cross-check a CSV row's filenames against the archive

**Checkpoint**: US5 delivered; the dashboard is still entirely read-only.

---

## Phase 10: Regression & Polish

- [X] T087 Re-run the **pre-existing, unmodified** 004 suites — `backend/tests/{unit,integration}/admin-dashboard/` excluding the new `photos/` folders — and require a green run with no edits to those files (FR-035/SC-014)
- [X] T088 [P] Verify captions and panel free text are sanitized on every new output path, and that bundle entry names are derived from server-side data only — never from a user-supplied filename (FR-020, constitution V)
- [X] T089 [P] Confirm route 4 (`images/:blueprintId`) still returns its original contract unchanged and its existing tests still pass. **Decision: route 4 is retained.** The frontend moves to route 6, but route 4 is a tested GET with no maintenance cost, and removing a working endpoint buys nothing; retiring it stays a one-line change if it is ever wanted
- [X] T090 Coverage gate ≥ 80 % including the new photo modules (constitution VII)
- [X] T091 [P] Keyboard & non-colour-only pass over the controls this amendment adds — 下載本圖全部材料 button, 只看有附照片 filter chip, panel-group expand/collapse, photo thumbnails and the storage panel: all reachable and operable by keyboard, and every state (全員無問題／標了問題／容量警示) conveyed by text+icon, never colour alone (constitution IX, FR-024)
- [X] T092 Walk `specs/004-admin-dashboard-export/quickstart.md` §Amendment steps 1–8 end to end and fix any drift

---

## Dependencies (amendment)

- **003 T090 (photo tables) blocks everything here.**
- T063 blocks T073/T074/T075/T078 — all photo reads go through it.
- T077 depends on the three services; the frontend (T079–T085) depends on T077 for real data.
- T065 is the release gate: if any of the four surfaces leaks a draft photo, do not ship.

## Parallel Opportunities (amendment)

- **Phase 8**: T058 ∥ T059 ∥ T060 ∥ T061 ∥ T062, then T063.
- **Phase 9 tests**: T064–T072 all `[P]`.
- **Phase 9 impl**: T073 ∥ T074 ∥ T075 ∥ T076; frontend T079 ∥ T080 ∥ T081 ∥ T082 ∥ T083 before T084 composes.
- **Phase 10**: T088 ∥ T089 ∥ T090 ∥ T091; T092 (quickstart) runs last.

## Notes (amendment)

- 004 still writes **nothing** — routes 6–9 are GET, CSRF-free, and no migration is added.
- The **only** place draft photos are counted is `PhotoStorageUsage` (it measures disk, not review progress). Every other photo number is submitted-only — see data-model.
- The global "all blueprints" bundle is deliberately **not** built (FR-033).

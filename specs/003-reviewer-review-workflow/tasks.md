---
description: "Task list for feature 003 — Reviewer Review Workflow"
---

# Tasks: 審查者審查流程（Reviewer Review Workflow）

**Input**: Design documents from `/specs/003-reviewer-review-workflow/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/review-api.md, quickstart.md (all present)

**Prerequisite features**: **001** (accounts-auth — session cookie + CSRF + `require-auth` / `require-role('REVIEWER')` middleware, `{ success, data, error, meta }` envelope, `backend/src/lib/errors.ts`, monorepo + Prisma + Vite + docker-compose + Vitest/Playwright scaffolding) and **002** (blueprint-catalog — `Region`/`Blueprint`/`Panel` entities, the `blueprint-public` projection that already excludes `aiPrompt`, the read-only `/api/blueprints/:id/image` route, and the shared `HIGH_RISK_BLUEPRINT_IDS` constant). 003's Setup/Foundational add ONLY feature-specific scaffolding (review Prisma models + migration + review-domain libs); they do NOT re-create the monorepo, the Express app, the middleware pipeline, or the test runners.

**Tests**: REQUIRED. Constitution VII mandates TDD with coverage ≥ 80%. For every user story the test tasks are listed BEFORE its implementation tasks and **MUST be written first and FAIL (RED) before the implementation makes them pass (GREEN)**. Backend: Vitest (unit) + supertest (integration). Frontend: Vitest + React Testing Library. Critical flows: Playwright E2E.

**Organization**: Phase 1 Setup → Phase 2 Foundational (blocking) → Phase 3–9 one phase per user story in spec priority order (US1–US3 = P1, US4–US6 = P2, US7 = P3) → Phase 10 Polish & Cross-Cutting.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on another unfinished task)
- **[Story]**: the user story a task serves (US1…US7); Setup/Foundational tasks carry no story tag
- Every task names an exact, real monorepo path

---

## Phase 1: Setup (feature-specific scaffolding only)

**Purpose**: create the empty 003 module skeleton inside the monorepo that 001 already established. No project init here.

- [ ] T001 [P] Create backend review module folders `backend/src/reviews/{routes,controllers,services,repositories,dto,validation}` (with barrel `backend/src/reviews/index.ts`) and test folders `backend/tests/unit/reviews/` and `backend/tests/integration/reviews/`
- [ ] T002 [P] Create frontend review module folders `frontend/src/components/review/`, `frontend/src/routes/` (review pages), `frontend/src/hooks/`, `frontend/src/state/`, the test folder `frontend/tests/review/`, and the empty E2E spec `e2e/review.spec.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the review-domain data model + shared backend/frontend libraries every user story depends on.

**⚠️ CRITICAL**: No user-story phase may begin until Phase 2 is complete.

- [ ] T003 [P] Add feature-specific error codes `OVERALL_JUDGEMENT_REQUIRED` (zh-TW `請先選擇整體判定`) and `BLUEPRINT_NOT_FOUND` (zh-TW `找不到該藍圖`) to `backend/src/lib/errors.ts`, reusing the shared `AUTH_REQUIRED` / `FORBIDDEN_ROLE` / `INVALID_PARAM` / `VALIDATION_ERROR` / `CSRF_INVALID` / `INTERNAL_ERROR` codes already defined there by 001
- [ ] T004 Add the 5 review enums and 2 models to `backend/prisma/schema.prisma`: `OverallJudgement`/`IndicationJudgement`/`WarningType`/`ProblemType`/`ReviewStatus` (each member ASCII id with `@map` to the verbatim zh-TW label per data-model.md); `Review` (`reviewer Account @relation(fields:[reviewerId])`, `blueprintId`→`Blueprint`, nullable `overallJudgement`/`indicationJudgement`/`indicationNote`, `status` default `草稿`, `createdAt`/`lastSavedAt`/`submittedAt`/`lastUpdatedAt`, **`@@unique([reviewerId, blueprintId])`**, indexes on `reviewerId`, `[reviewerId, status]`, `blueprintId`); `PanelReview` (`reviewId` `onDelete: Cascade`, `panelIndex` 1..4, `requiredWarnings WarningType[]` default `[]`, `warningOther`, `problemTypes ProblemType[]` default `[]`, `problemNote`, **`@@unique([reviewId, panelIndex])`**)
- [ ] T005 Generate and apply the migration `backend/prisma/migrations/<ts>_review/migration.sql` via `npx prisma migrate dev --name review` (creates the 5 native enums + `Review` + `PanelReview`; verify both tables exist per quickstart §2) — depends on T004
- [ ] T006 [P] Write unit test for the enum bidirectional maps in `backend/tests/unit/reviews/enum-maps.test.ts` (every zh-TW value ↔ Prisma id round-trips for all 5 enums; unknown value rejected) — MUST fail first (RED)
- [ ] T007 [P] Write unit test for the zod base schemas in `backend/tests/unit/reviews/review-schema.test.ts` (`:blueprintId` regex `^[SHETPKLY][1-9][0-9]?$`; `region`/`status` query enums; `ReviewDocument` body = exactly 4 panels with unique `panelIndex` 1..4, enum-member validation + dedupe of `requiredWarnings`/`problemTypes`, free-text length caps, client `status`/timestamps ignored) — MUST fail first (RED)
- [ ] T008 [P] Implement `backend/src/reviews/dto/enum-maps.ts` — bidirectional Prisma↔zh-TW maps for the 5 review enums (makes T006 pass)
- [ ] T009 Implement `backend/src/reviews/validation/review.schema.ts` — zod param/query/`ReviewDocument` schemas described in T007 (makes T007 pass) — depends on T008
- [ ] T010 Implement `backend/src/reviews/repositories/review.repository.ts` — Prisma data access: `findOwnReviewWithPanels(reviewerId, blueprintId)`; `upsertReviewWithPanels(...)` that in ONE `$transaction` upserts the `Review` on `(reviewerId, blueprintId)` and snapshot-replaces its 4 `PanelReview` rows; status-counting query helpers for progress — depends on T005, T008
- [ ] T011 Implement `backend/src/reviews/dto/review.dto.ts` (base) — reviewer projection composing 002's `blueprint-public` (so `aiPrompt` is structurally absent, `畫面視覺描述` + `isHighRisk` present), Prisma-enum→zh-TW on output, and **HTML-escape sanitize of `indicationNote`/`warningOther`/`problemNote` on output** (orphan text preserved, XSS neutralised) — depends on T008
- [ ] T012 Create `backend/src/reviews/routes/review.routes.ts` + `backend/src/reviews/controllers/review.controller.ts` skeletons and mount the router at `/api/reviews` in `backend/src/app.ts` behind 001's `require-auth` + `require-role('REVIEWER')` (and CSRF on `PATCH`/`POST`); `reviewerId` is read from `req.session` only — depends on T003
- [ ] T013 [P] Create the frontend API client skeleton `frontend/src/api/reviews.ts` (TanStack Query function stubs: `openReview` / `autosaveReview` / `submitReview` / `getNext` / `getProgress`, all sending zh-TW enum values verbatim and the CSRF header on mutations)
- [ ] T014 [P] Write unit test for the immutable draft reducer in `frontend/tests/review/reviewDraft.test.ts` (set overall/indication, toggle a panel multi-select member, edit orphan free-text — every action returns a NEW state, never mutates) — MUST fail first (RED)
- [ ] T015 [P] Implement `frontend/src/state/reviewDraft.ts` — immutable reducer for the in-progress `ReviewDocument` draft (makes T014 pass)

**Checkpoint**: review tables migrated; enum maps, zod schemas, repository, reviewer DTO, mounted+guarded router, FE api client + draft reducer all exist. User-story phases can begin.

---

## Phase 3: User Story 1 - 圖文並陳審查單張圖 (Priority: P1) 🎯 MVP

**Goal**: open one blueprint in Layout A — left sticky 2×2 PNG (inline zoom/pan, no lightbox) + full read-only blueprint metadata (incl. each panel's 畫面視覺描述, never `aiPrompt`); right the review form (整體判定 + 適應症 + four panel forms). Source data stays read-only.

**Independent Test**: open S1 as a reviewer — left shows the full PNG + all read-only metadata, right shows all four gate fields with an empty 4-panel template; typing never alters source data.

### Tests for User Story 1 (write first — RED) ⚠️

- [ ] T016 [P] [US1] Integration test `backend/tests/integration/reviews/open-review.test.ts` for `GET /api/reviews/:blueprintId`: 200 returns `blueprint` (metadata + 4 panels with `visualDescription`, `isHighRisk`) + `review` empty template (4 panels, nulls/`[]`) + `progress{submitted,total}`; `data.blueprint` has NO `aiPrompt`; `400 INVALID_PARAM` on bad id shape; `404 BLUEPRINT_NOT_FOUND` on valid-shape-unknown; `401 AUTH_REQUIRED` (no session); `403 FORBIDDEN_ROLE` (admin) — MUST fail first
- [ ] T017 [P] [US1] Unit test `backend/tests/unit/reviews/review-dto.test.ts`: reviewer projection excludes `aiPrompt`, maps every enum to its zh-TW value, surfaces `isHighRisk` from the shared 002 constant, and HTML-escapes free-text on output — MUST fail first
- [ ] T018 [P] [US1] RTL test `frontend/tests/review/ReviewWorkspace.test.tsx`: `ReviewLayout` keeps the left column sticky; `ZoomableImage` zooms inline with keyboard (+/-/arrows/0) and renders NO lightbox/modal; `BlueprintMetaPanel` renders 適應症/練習次數/溫馨小叮嚀 + each panel's 步驟名/動作說明/時間提示/畫面視覺描述 read-only; 整體判定/適應症/4 panel forms render — MUST fail first
- [ ] T019 [P] [US1] Playwright E2E in `e2e/review.spec.ts` (US1 block): log in as reviewer, open S1, assert PNG + full metadata on the left and the four-gate form on the right, assert `aiPrompt` text never appears — MUST fail first

### Implementation for User Story 1 (make tests pass — GREEN)

- [ ] T020 [US1] Implement `open(reviewerId, blueprintCode)` in `backend/src/reviews/services/review.service.ts`: resolve the catalog business code → `Blueprint.id`, fetch 002's `blueprint-public`, load the reviewer's own review via the repository or return an empty 4-panel template, attach `progress{submitted,total}` (via repository count) — depends on T010, T011
- [ ] T021 [US1] Wire `GET /api/reviews/:blueprintId` in `backend/src/reviews/controllers/review.controller.ts` + `backend/src/reviews/routes/review.routes.ts` (validate param with the zod schema, call `open`, wrap in the envelope, map errors to `INVALID_PARAM`/`BLUEPRINT_NOT_FOUND`) — depends on T020
- [ ] T022 [US1] Implement `openReview(blueprintId)` in `frontend/src/api/reviews.ts` (TanStack Query) — depends on T013
- [ ] T023 [P] [US1] Implement `frontend/src/components/review/ZoomableImage.tsx` — inline zoom/pan via CSS transform, fit-whole default, keyboard +/-/arrows/0, NO lightbox (FR-006)
- [ ] T024 [P] [US1] Implement `frontend/src/components/review/BlueprintMetaPanel.tsx` — read-only 適應症/練習次數/溫馨小叮嚀 + the 4 panels' 步驟名/動作說明/時間提示/畫面視覺描述 (FR-007/FR-009)
- [ ] T025 [P] [US1] Implement `frontend/src/components/review/OverallJudgementField.tsx` — single-select radio 通過／需小修／需重做 (FR-010)
- [ ] T026 [P] [US1] Implement `frontend/src/components/review/IndicationField.tsx` — single-select 合理／有疑慮 + optional 適應症說明 free text (FR-012)
- [ ] T027 [P] [US1] Implement `frontend/src/components/review/PanelReviewForm.tsx` — per-panel 需要添加的警語 (multi) + 警語－其它 + 問題類型 (multi) + 問題說明, all optional, bound to the immutable draft reducer (FR-013–FR-020)
- [ ] T028 [P] [US1] Implement `frontend/src/components/review/TopProgressBar.tsx` — fixed-top 已提交 x／51 fed by `open`'s `progress` (FR-041)
- [ ] T029 [US1] Implement `frontend/src/components/review/ReviewLayout.tsx` — left/right split with the left column sticky (FR-004/FR-005), composing T023–T028 — depends on T023–T028
- [ ] T030 [US1] Implement `frontend/src/routes/ReviewWorkspacePage.tsx` + register the `/review/:blueprintId` React Router route; render Layout A from `openReview` data into the draft reducer — depends on T022, T029

**Checkpoint**: a reviewer can open any blueprint and see image+text side by side with all gate fields. US1 is independently demoable (MVP).

---

## Phase 4: User Story 2 - 乾淨圖快路徑：一選即提交、自動前進、純鍵盤 (Priority: P1)

**Goal**: for a clean image, select 通過 and submit with all four panels empty (no warning), then auto-advance to the next unreviewed blueprint — entirely by keyboard.

**Independent Test**: on a clean image, keyboard-only select 通過 → submit → assert no warning, status 已提交, and auto-advance lands on the deterministic next unreviewed image, in ≤ 15 s.

### Tests for User Story 2 (write first — RED) ⚠️

- [ ] T031 [P] [US2] Unit test `backend/tests/unit/reviews/review-ordering.test.ts`: next-unreviewed sorts by Region `displayOrder` then numeric blueprint suffix (`S2` before `S10`; regions S→H→E→T→P→K→L→Y), skips `已提交`, and returns `null` when all 51 are `已提交` — MUST fail first
- [ ] T032 [P] [US2] Integration test `backend/tests/integration/reviews/submit-review.test.ts`: `POST /api/reviews/:blueprintId/submit` with `overallJudgement:"通過"` and 4 all-empty panels → `200` `status:"已提交"`, **no warning**, `next` set, `progress` incremented; CSRF enforced — MUST fail first (covers FR-018/SC-004)
- [ ] T033 [P] [US2] RTL test `frontend/tests/review/useReviewKeyboard.test.tsx`: the full single-image path (focus 整體判定 → choose 通過 → trigger submit) is reachable by keyboard with predictable focus order; `SubmitBar` triggers submit + auto-advance — MUST fail first
- [ ] T034 [P] [US2] Playwright E2E in `e2e/review.spec.ts` (US2 block): keyboard-only clean-image review completes in ≤ 15 s with no mouse and auto-advances to the next unreviewed image (SC-001/SC-011) — MUST fail first

### Implementation for User Story 2 (GREEN)

- [ ] T035 [US2] Implement `backend/src/reviews/services/review-ordering.ts` — `nextUnreviewed(reviewerId)` joining the 002 catalog list with the reviewer's review statuses, ordered Region `displayOrder` → numeric id, skipping `已提交` (makes T031 pass) — depends on T010
- [ ] T036 [US2] Implement `submit(reviewerId, blueprintCode, document)` in `backend/src/reviews/services/review.service.ts`: persist the full document via the repository, set `status = 已提交` (+`submittedAt` on first submit), bump `lastUpdatedAt`, accept all-empty panels with no warning, then compute `next`/`completed` via `review-ordering.ts` — depends on T010, T035
- [ ] T037 [US2] Wire `POST /api/reviews/:blueprintId/submit` in `backend/src/reviews/controllers/review.controller.ts` + routes (zod body, CSRF, envelope) — depends on T036
- [ ] T038 [US2] Implement `submitReview(blueprintId, document)` in `frontend/src/api/reviews.ts` — depends on T013
- [ ] T039 [P] [US2] Implement `frontend/src/hooks/useReviewKeyboard.ts` — focus order + shortcuts for the full keyboard path (FR-037/FR-038)
- [ ] T040 [US2] Implement `frontend/src/components/review/SubmitBar.tsx` — prev/next + save-draft state + submit button wired to `submitReview` (FR-027) — depends on T038
- [ ] T041 [US2] Wire auto-advance into `frontend/src/routes/ReviewWorkspacePage.tsx` — on submit success navigate to `data.next` (skips 已提交) — depends on T030, T040

**Checkpoint**: clean images can be cleared one-keystroke fast and the page auto-advances. US1 + US2 work together.

---

## Phase 5: User Story 3 - autosave 草稿不丟失、可續審、狀態不回退 (Priority: P1)

**Goal**: every unsubmitted edit autosaves as 草稿 and restores 100% across navigation/reload/re-login (incl. orphan free-text); 繼續審查 jumps to the deterministic next unreviewed; autosave never elevates 草稿→已提交 and never regresses 已提交→草稿.

**Independent Test**: fill partial fields without submitting, reload → 100% restored and still 草稿 (not counted); submit then autosave again → stays 已提交.

### Tests for User Story 3 (write first — RED) ⚠️

- [ ] T042 [P] [US3] Unit test `backend/tests/unit/reviews/status-machine.test.ts`: no row + autosave → 草稿; 草稿 + autosave → 草稿 (never 已提交); 已提交 + autosave → 已提交 (never 草稿), `submittedAt` unchanged, not double-counted; timestamps set correctly (FR-024–FR-026) — MUST fail first
- [ ] T043 [P] [US3] Integration test `backend/tests/integration/reviews/autosave-review.test.ts`: `PATCH /api/reviews/:blueprintId` → `200` `status:"草稿"`; orphan `warningOther`/`problemNote` preserved when their set/checkbox is empty (FR-019); re-open restores every field exactly (SC-002); PATCH on a `已提交` row keeps `已提交` (no regress, SC-006); draft not counted in progress; CSRF required — MUST fail first
- [ ] T044 [P] [US3] Integration test `backend/tests/integration/reviews/next-review.test.ts`: `GET /api/reviews/next` returns the deterministic first 未審 (繼續審查) and `{next:null, completed:true}` when 51/51 — MUST fail first
- [ ] T045 [P] [US3] RTL test `frontend/tests/review/useAutosaveReview.test.tsx`: edits trigger a debounced `PATCH` (never `submit`), and the draft is restored from the server on mount — MUST fail first
- [ ] T046 [P] [US3] Playwright E2E in `e2e/review.spec.ts` (US3 block): partial fill → reload → fields (incl. orphan text) fully restored and still 草稿; submit then autosave → remains 已提交 (US3 acceptance) — MUST fail first

### Implementation for User Story 3 (GREEN)

- [ ] T047 [US3] Implement `autosave(reviewerId, blueprintCode, document)` in `backend/src/reviews/services/review.service.ts`: status-preserving upsert (no row→草稿, 草稿→草稿, 已提交→已提交), set `lastSavedAt`+`lastUpdatedAt`, never set `submittedAt`, store free-text verbatim (orphan-preserved) — depends on T010 (makes T042 pass)
- [ ] T048 [US3] Wire `PATCH /api/reviews/:blueprintId` in `backend/src/reviews/controllers/review.controller.ts` + routes (zod body, CSRF, ignore client `status`, envelope) — depends on T047
- [ ] T049 [US3] Implement `next(reviewerId)` in `backend/src/reviews/services/review.service.ts` and wire `GET /api/reviews/next` in the controller + routes (uses `review-ordering.ts`) — depends on T035
- [ ] T050 [US3] Implement `autosaveReview(blueprintId, document)` + `getNext()` in `frontend/src/api/reviews.ts` — depends on T013
- [ ] T051 [US3] Implement `frontend/src/hooks/useAutosaveReview.ts` — debounced full-document `PATCH`, restore-on-mount, structurally incapable of calling submit (FR-022–FR-026) — depends on T050
- [ ] T052 [US3] Wire autosave + restore into `frontend/src/routes/ReviewWorkspacePage.tsx` and add the 繼續審查 entry that calls `getNext` and navigates (FR-031) — depends on T030, T051

**Checkpoint**: drafts survive reload/re-login and 繼續審查 always lands correctly; no state regression. All three P1 stories are complete (review MVP).

---

## Phase 6: User Story 4 - 提交需整體判定、行內擋下、自動前進、51/51 完成 (Priority: P2)

**Goal**: submit requires 整體判定 — null is blocked inline with 請先選擇整體判定 and not sent; valid submit auto-advances to the next unreviewed; 51/51 shows a completion state with review/revise entry points (never a dead end).

**Independent Test**: submit without 整體判定 → blocked inline, nothing sent; select then submit → advances to the correct next unreviewed; simulate 51 submitted → completion state.

### Tests for User Story 4 (write first — RED) ⚠️

- [ ] T053 [P] [US4] Integration test `backend/tests/integration/reviews/submit-validation.test.ts`: submit with `overallJudgement:null` → `400 OVERALL_JUDGEMENT_REQUIRED` message `請先選擇整體判定`, nothing persisted as 已提交 (SC-003); valid submit returns `next` skipping 已提交; submitting the last image → `next:null, completed:true, progress 51/51` (SC-008) — MUST fail first
- [ ] T054 [P] [US4] RTL test `frontend/tests/review/CompletionState.test.tsx`: missing 整體判定 shows the inline `請先選擇整體判定` and blocks the call; the 51/51 completion view renders review/revise entry points (not a dead end) — MUST fail first
- [ ] T055 [P] [US4] Playwright E2E in `e2e/review.spec.ts` (US4 block): null-judgement submit blocked inline; valid submit auto-advances; reaching 51/51 shows the completion state — MUST fail first

### Implementation for User Story 4 (GREEN)

- [ ] T056 [US4] Add the submit guard to `submit(...)` in `backend/src/reviews/services/review.service.ts`: if `overallJudgement === null` throw `OVERALL_JUDGEMENT_REQUIRED` before any status change (FR-011) — depends on T036
- [ ] T057 [US4] Add the inline `請先選擇整體判定` block (validate before calling submit) in `frontend/src/components/review/SubmitBar.tsx` / `OverallJudgementField.tsx` — depends on T040
- [ ] T058 [US4] Implement `frontend/src/components/review/CompletionState.tsx` (51/51 with review/revise entry points) and render it in `ReviewWorkspacePage.tsx`/progress when `completed:true` (FR-029) — depends on T041
- [ ] T059 [US4] Add the client-only non-blocking soft prompt (需小修／需重做 + 四格全空 → suggest at least one 問題說明, still allow submit) in `frontend/src/components/review/SubmitBar.tsx` (FR-030) — depends on T040

**Checkpoint**: submit is gated on 整體判定 server-side, auto-advance is deterministic, and 51/51 is a real completion state.

---

## Phase 7: User Story 5 - 重開並修訂已提交的審查 (Priority: P2)

**Goal**: reopen one's own 已提交 review, edit any field, and re-submit in place — one (reviewer×blueprint) row, `submittedAt` unchanged, `lastUpdatedAt` refreshed; a reviewer sees only their own reviews.

**Independent Test**: reopen a submitted review, change a field, re-submit → still one row, `submittedAt` unchanged, `lastUpdatedAt` newer; reviewer B never sees A's data.

### Tests for User Story 5 (write first — RED) ⚠️

- [ ] T060 [P] [US5] Integration test `backend/tests/integration/reviews/resubmit-review.test.ts`: reopen returns the existing 已提交 review editable; re-submit overwrites in place, keeps exactly one `(reviewerId, blueprintId)` row, leaves `submittedAt` unchanged, bumps `lastUpdatedAt`, is not double-counted (FR-032) — MUST fail first
- [ ] T061 [P] [US5] Integration test `backend/tests/integration/reviews/reviewer-isolation.test.ts`: reviewer B opening A's blueprint gets an empty template (never A's draft/submission); B's progress is independent; there is no `?reviewerId=` path anywhere (FR-003/SC-010) — MUST fail first
- [ ] T062 [P] [US5] Playwright E2E in `e2e/review.spec.ts` (US5 block): reopen → edit → re-submit shows a refreshed last-updated and still one review (US5 acceptance) — MUST fail first

### Implementation for User Story 5 (GREEN)

- [ ] T063 [US5] Finalize re-submit / in-place-edit semantics in `backend/src/reviews/services/review.service.ts`: `submittedAt` set on first submit only, `lastUpdatedAt` bumped on every mutation, status stays 已提交, single row guaranteed by the unique key (FR-032) — depends on T036, T047, T056
- [ ] T064 [US5] Wire the reopen flow in `frontend/src/routes/ReviewWorkspacePage.tsx`: load an existing 已提交 review editable, and have `SubmitBar` present 再次提交 (FR-032) — depends on T030, T040

**Checkpoint**: edit-after-submit works in place with refreshed last-updated and strict per-reviewer isolation.

---

## Phase 8: User Story 6 - 高風險圖的審查警示 (Priority: P2)

**Goal**: for exactly the 9 high-risk blueprints {S4,T8,P1,P4,P5,K2,K3,K5,L3}, show a non-blocking caution conveyed by icon + text (never color alone); the other 42 show nothing; submit is never blocked.

**Independent Test**: open a high-risk image → caution (icon+text) appears; open a non-high-risk image → none; filling/submitting is never blocked.

### Tests for User Story 6 (write first — RED) ⚠️

- [ ] T065 [P] [US6] Unit test `backend/tests/unit/reviews/high-risk.test.ts`: `isHighRisk` in the open payload is `true` for exactly the 9 ids from the shared `HIGH_RISK_BLUEPRINT_IDS` (002 constant, not redefined) and `false` for all others (SC-007) — MUST fail first
- [ ] T066 [P] [US6] RTL test `frontend/tests/review/HighRiskBadge.test.tsx`: the badge renders an icon AND text (asserts non-color-only), is non-blocking, and is absent when `isHighRisk:false` — MUST fail first
- [ ] T067 [P] [US6] Playwright E2E in `e2e/review.spec.ts` (US6 block): S4 shows the icon+text caution and submit is not blocked; S1 shows none (US6 acceptance) — MUST fail first

### Implementation for User Story 6 (GREEN)

- [ ] T068 [US6] Confirm/ensure `backend/src/reviews/dto/review.dto.ts` surfaces `isHighRisk` from the shared 002 `HIGH_RISK_BLUEPRINT_IDS` constant only (no redefinition) (FR-036) — depends on T011
- [ ] T069 [P] [US6] Implement `frontend/src/components/review/HighRiskBadge.tsx` — icon + text, non-color-only, non-blocking (FR-033–FR-035)
- [ ] T070 [US6] Render `HighRiskBadge` in `frontend/src/routes/ReviewWorkspacePage.tsx` only when `blueprint.isHighRisk` is true — depends on T030, T069

**Checkpoint**: the 9 high-risk images carry an accessible, non-blocking caution; the other 42 do not.

---

## Phase 9: User Story 7 - 個人審查進度頁 (Priority: P3)

**Goal**: a personal progress page showing 已提交 x／51, draft count, per-region (S/H/E/T/P/K/L/Y) distribution, and a region/status-filterable index with jump-to-blueprint — reflecting only the caller.

**Independent Test**: with some reviews done, open the progress page → counts and per-region distribution are correct; region/status filters and jump work; data is the caller's only.

### Tests for User Story 7 (write first — RED) ⚠️

- [ ] T071 [P] [US7] Unit test `backend/tests/unit/reviews/review-progress.test.ts`: aggregation computes `submitted`/`draft`/`notStarted`/`total=51`, per-region buckets, and derives 未開始 = no row; only the caller's rows are counted (SC-009/FR-042) — MUST fail first
- [ ] T072 [P] [US7] Integration test `backend/tests/integration/reviews/progress.test.ts`: `GET /api/reviews/progress` returns counts + `meta` + ordered `perRegion` + `index`; `region`/`status` filter only the `index`; bad filter → `400 INVALID_PARAM`; another reviewer's data never appears; empty reviewer → 0/51 with empty index — MUST fail first
- [ ] T073 [P] [US7] RTL test `frontend/tests/review/ReviewProgressPage.test.tsx`: renders 已提交 x／51 + draft + per-region; region/status filter narrows the index; clicking a 草稿 jumps to it; empty state shows 0/51 without error — MUST fail first
- [ ] T074 [P] [US7] Playwright E2E in `e2e/review.spec.ts` (US7 block): progress counts match, filter by 區域＝膝(K)+狀態＝未開始, click a 草稿 → jumps with draft restored (US7 acceptance) — MUST fail first

### Implementation for User Story 7 (GREEN)

- [ ] T075 [US7] Implement `backend/src/reviews/services/review-progress.service.ts` — 已提交/草稿/未開始 counts, per-region distribution, and the region/status-filterable index, all scoped to the session reviewer (FR-039/FR-040/FR-042) — depends on T010, T011
- [ ] T076 [US7] Wire `GET /api/reviews/progress` in `backend/src/reviews/controllers/review.controller.ts` + routes (zod query, envelope with `meta` counts) — depends on T075
- [ ] T077 [US7] Implement `getProgress(filters)` in `frontend/src/api/reviews.ts` — depends on T013
- [ ] T078 [US7] Implement `frontend/src/routes/ReviewProgressPage.tsx` + register the `/progress` route — counts, per-region, region/status filter, jump-to-blueprint (FR-039/FR-040) — depends on T077

**Checkpoint**: reviewers have a personal, isolated progress dashboard with filter + jump. All user stories complete.

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: cross-story hardening, security, accessibility, coverage, and validation.

- [ ] T079 [P] Integration test + fix `backend/tests/integration/reviews/sanitization.test.ts` — `indicationNote`/`warningOther`/`problemNote` are stored verbatim (orphan-preserved) but HTML-escaped on every output route (XSS, constitution V)
- [ ] T080 [P] Integration test `backend/tests/integration/reviews/enum-wire.test.ts` — every request/response across the 5 routes carries enum values as the verbatim zh-TW strings (constitution VIII)
- [ ] T081 Accessibility audit in `frontend/src/routes/ReviewWorkspacePage.tsx` + components — predictable focus order, visible focus ring, full keyboard operability of the single-image path (FR-037/FR-038/SC-011)
- [ ] T082 Security sweep across `backend/src/reviews/` — CSRF enforced on `PATCH`/`POST`, `reviewerId` resolved only from the session (never path/query/body), no route ever serializes `aiPrompt`, generic `INTERNAL_ERROR` leaks nothing (constitution IV/V, SC-010)
- [ ] T083 Run `cd backend && npm run test:coverage` and `cd frontend && npm test -- --coverage`; close gaps to ≥ 80% lines/branches for `backend/src/reviews/` and `frontend/src/components/review/` + hooks (constitution VII)
- [ ] T084 Execute the `specs/003-reviewer-review-workflow/quickstart.md` end-to-end on localhost (ports 5180 / 3100 / 5433→5432) and confirm every acceptance snippet (FR-039/041, US1–US7, role gate, isolation)
- [ ] T085 [P] Update `specs/003-reviewer-review-workflow/quickstart.md` / project README with any drift discovered during T084

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 Setup**: depends only on 001's monorepo + 002's catalog already existing; no internal deps.
- **Phase 2 Foundational**: depends on Phase 1. **BLOCKS every user story.** Internal: T004→T005; T006→T008; T007→(T008→)T009; T005+T008→T010; T008→T011; T003→T012; T014→T015.
- **Phase 3 US1 (P1)**: depends on Phase 2. The MVP.
- **Phase 4 US2 (P1)**: depends on Phase 2; reuses US1's workspace (T030) for auto-advance wiring.
- **Phase 5 US3 (P1)**: depends on Phase 2; reuses US2's `review-ordering.ts` (T035) for `GET /next`, and US1's workspace for autosave/restore wiring.
- **Phase 6 US4 (P2)**: depends on US2's `submit` (T036) and `SubmitBar` (T040).
- **Phase 7 US5 (P2)**: depends on US2/US3/US4 service methods (T036/T047/T056) and US1's workspace (T030).
- **Phase 8 US6 (P2)**: depends on US1's DTO/open (T011/T030); otherwise independent.
- **Phase 9 US7 (P3)**: depends on Phase 2 (T010/T011); otherwise independent of US2–US6.
- **Phase 10 Polish**: depends on all targeted user stories being complete.

### Per-Story Dependencies

- US1 → Foundational only (MVP).
- US2 → Foundational; integrates with US1 (auto-advance navigation).
- US3 → Foundational; reuses US2 ordering for `GET /next`; integrates with US1 (autosave/restore).
- US4 → US2 (submit + SubmitBar).
- US5 → US2/US3/US4 service methods + US1 workspace.
- US6 → US1 DTO/open.
- US7 → Foundational; independent of US2–US6.

### Within Each User Story

Order is **tests → models/util → services → endpoints → frontend api → components → integration wiring**. All test tasks are written first and MUST fail (RED) before their implementation (GREEN). Same-file tasks (e.g. `review.service.ts`, `review.controller.ts`, `ReviewWorkspacePage.tsx`, `SubmitBar.tsx`, `api/reviews.ts`) run sequentially and are NOT marked `[P]`.

---

## Parallel Opportunities

- **Phase 1**: T001 ∥ T002 (backend vs frontend skeletons).
- **Phase 2**: T003 ∥ T006 ∥ T007 ∥ T013 ∥ T014; T008 ∥ (after its test) — then the dependent chain T009/T010/T011/T012/T015.
- **Within each story**: all test tasks marked `[P]` run together (different files), e.g. US1 T016 ∥ T017 ∥ T018 ∥ T019; US7 T071 ∥ T072 ∥ T073 ∥ T074.
- **Frontend components are independent files** and parallelize: US1 T023 ∥ T024 ∥ T025 ∥ T026 ∥ T027 ∥ T028 (then T029 composes them, T030 mounts).
- **Across stories (if staffed)**: once Phase 2 is done, US1, US2, US3, US6, US7 can each start in parallel; US4 waits on US2, US5 waits on US2/US3/US4.
- **Polish**: T079 ∥ T080 ∥ T085 are independent of each other.

---

## Implementation Strategy

- **MVP** = Phase 1 + Phase 2 + Phase 3 (US1). Stop and validate: a reviewer can open any blueprint in Layout A with all four gate fields, source data read-only.
- **P1 increment** = add US2 (fast keyboard submit + auto-advance) and US3 (autosave/restore/no-regress) → the complete, reliable single-pass review loop.
- **P2 increment** = US4 (submit gate + 51/51) → US5 (reopen/revise + isolation) → US6 (high-risk caution).
- **P3 increment** = US7 (personal progress page).
- Finish with Phase 10 (sanitization, enum-wire, a11y, security, coverage ≥ 80%, quickstart validation).

---

# Amendment 2026-08-27 — 參考照片與標註（US8／US9）

Continues the numbering above (T086+). Same rules: `[P]` = different files, no dependency on
an unfinished task; **test tasks come first and MUST fail (RED) before the implementation
that makes them pass**; every task names a real path.

**⚠️ T088 must run BEFORE T090.** The SC-017 baseline is a snapshot of the *pre-migration*
review corpus — once the migration is applied it cannot be taken retroactively.

## Phase 11: Foundational — 照片領域基礎（Blocking）

- [ ] T086 [P] Add photo error codes to `backend/src/lib/errors.ts`: `UNSUPPORTED_IMAGE_TYPE`（僅支援 JPG／PNG／WebP 格式的照片）、`IMAGE_TOO_LARGE`（照片檔案過大）、`PHOTO_NOT_FOUND`（找不到該照片）、`PHOTO_STORAGE_FULL`（照片儲存空間已滿，請聯絡管理員）— reusing the shared codes 001 already defines
- [ ] T087 [P] Add `PHOTO_STORAGE_LIMIT_BYTES` (default `10737418240` = 10 GiB) and `PHOTO_MAX_FILE_BYTES` to `backend/src/config/env.ts`, zod-validated as positive integers, fail-fast at startup (constitution V)
- [ ] T088 **Capture the SC-017 baseline BEFORE migrating**: add `backend/tests/regression/capture-review-corpus.ts` that dumps every scalar of `Review` + `PanelReview` per (reviewer × blueprint) in a stable order to a fixture file, and run it against the current database
- [ ] T089 Add `ReviewPhoto` and `ReviewPhotoBlob` to `backend/prisma/schema.prisma` per data-model: `ReviewPhoto`(`reviewId` → `Review` **onDelete: Cascade**, `panelIndex Int?`, `caption`, `originalMimeType`, `originalByteSize`, `displayByteSize`, `annotatedByteSize?`, `annotationState Json?`, `annotatedAt?`, `sortOrder`, timestamps, index `[reviewId, panelIndex, sortOrder]`, CHECK `panelIndex IS NULL OR 1..4`, **no unique on (reviewId, panelIndex)** — FR-048); `ReviewPhotoBlob`(`photoId` PK+FK Cascade, `original Bytes`, `display Bytes`, `annotated Bytes?`, `originalAsJpeg Bytes?`) plus the virtual `photos ReviewPhoto[]` field on `Review`. **No other model may be edited** — depends on T088
- [ ] T090 Generate and apply `backend/prisma/migrations/<ts>_review_photo/migration.sql` via `npx prisma migrate dev --name review_photo`, then assert the SQL contains **zero** `ALTER TABLE` statements (FR-060) — depends on T089
- [ ] T091 [P] Write unit test `backend/tests/unit/reviews/photos/image-validation.test.ts` — magic-byte detection for JPEG/PNG/WebP/HEIC; a JPEG renamed `.png` is classified by bytes not extension; a client-sent `Content-Type` is ignored; the `original` allow-list includes HEIC while `display`/`annotated` do not — MUST fail first (RED)
- [ ] T092 [P] Write unit test `backend/tests/unit/reviews/photos/photo-storage.test.ts` — usage sums `original + display + COALESCE(annotated,0)`; below/at/over the ceiling classify correctly; the 80 % threshold is exclusive-below and inclusive-at — MUST fail first (RED)
- [ ] T093 [P] Write unit test `backend/tests/unit/reviews/photos/photo-schema.test.ts` — zod: `panelIndex` optional and 1..4 when present, caption length cap, `variant` enum `display|original|annotated`, unknown fields stripped — MUST fail first (RED)
- [ ] T094 [P] Write unit test `backend/tests/unit/reviews/photos/submit-gate.test.ts` — `allPanelsAddressed` returns true for a panel that is neither `noProblem` nor annotated **but carries ≥ 1 photo**, and false for one with neither (FR-049) — MUST fail first (RED)
- [ ] T095 Implement `backend/src/reviews/photos/services/image-validation.ts` (makes T091 pass)
- [ ] T096 Implement `backend/src/reviews/photos/services/photo-storage.service.ts` — usage aggregate over `ReviewPhoto` byte columns only (never the blob table) + ceiling check (makes T092 pass) — depends on T090
- [ ] T097 Implement `backend/src/reviews/photos/validation/review-photo.schema.ts` (makes T093 pass)
- [ ] T098 Implement `backend/src/reviews/photos/repositories/review-photo.repository.ts` — **explicit `select` on every query**; expose no `findMany` over `ReviewPhotoBlob`; blob reads by primary key only (research D11) — depends on T090, T097
- [ ] T099 Create `backend/src/reviews/photos/routes/review-photo.routes.ts` + `controllers/review-photo.controller.ts` skeletons, mounted on the existing `/api/reviews` router behind `requireAuth` + `requireRole('REVIEWER')` + `requirePasswordCurrent` (+ CSRF on mutations), with `multer` **memoryStorage** and `PHOTO_MAX_FILE_BYTES` limits — depends on T086, T087
- [ ] T100 [P] Create `frontend/src/api/review-photos.ts` — upload (multipart) / delete / caption / annotation get+put / file URL builders, CSRF header on mutations
- [ ] T101 [P] Write unit test `frontend/tests/review/prepareImage.test.ts` — a decodable image yields a ~1600 px JPEG display part and the original bytes are passed through **unmodified**; an undecodable-natively input triggers the lazy HEIC path — MUST fail first (RED)
- [ ] T102 Implement `frontend/src/lib/prepareImage.ts` — canvas decode → long-edge-1600 JPEG; the original `File` is forwarded untouched (FR-052) (makes T101 pass)
- [ ] T103 Implement `frontend/src/lib/heicDecode.lazy.ts` — dynamic-import WASM decoder used **only** when the browser cannot decode the file natively (research D16)

**Checkpoint**: photo tables migrated (zero ALTER), validation/storage/schema/repository in place, guarded routes mounted, frontend can produce the display derivative.

---

## Phase 12: User Story 8 - 以參考照片說明正確動作 (Priority: P2)

**Goal**: attach/delete/caption photos per panel and at image level; they persist immediately, survive reload, satisfy the panel gate, and never regress a submitted review.

### Tests (write first — RED)

- [ ] T104 [P] `backend/tests/integration/reviews/photos/upload-creates-draft.test.ts` — uploading with no existing review creates one as `草稿`; the reviewer's submitted count is unchanged (FR-050)
- [ ] T105 [P] `backend/tests/integration/reviews/photos/submitted-no-regress.test.ts` — uploading/deleting/captioning on a `已提交` review keeps `已提交`, refreshes `lastUpdatedAt`, leaves `submittedAt` untouched, and requires no re-submit (FR-051/SC-015)
- [ ] T106 [P] `backend/tests/integration/reviews/photos/gate-with-photo.test.ts` — a panel with **only** a photo submits successfully; **and the race case**: upload then submit immediately with no intervening autosave still succeeds (FR-049/SC-014, research D15)
- [ ] T107 [P] `backend/tests/integration/reviews/photos/isolation.test.ts` — reviewer B gets **404 `PHOTO_NOT_FOUND`** (never 403) on every photo route for A's photo id (FR-057/SC-016)
- [ ] T108 [P] `backend/tests/integration/reviews/photos/reset-cascade.test.ts` — after reset, the review's `ReviewPhoto` and `ReviewPhotoBlob` rows are gone and orphan blob count is 0 (FR-059)
- [ ] T109 [P] `backend/tests/integration/reviews/photos/storage-full.test.ts` — at the ceiling, upload returns 409 `PHOTO_STORAGE_FULL` while autosave, submit, delete and file-fetch all still return 200 (FR-061/SC-020)
- [ ] T110 [P] `backend/tests/integration/reviews/photos/upload-validation.test.ts` — non-image bytes and a spoofed `Content-Type` are rejected `UNSUPPORTED_IMAGE_TYPE`; oversize is `IMAGE_TOO_LARGE`; HEIC is accepted for `original` but rejected for `display`
- [ ] T111 [P] `backend/tests/integration/reviews/photos/open-returns-photos.test.ts` — `GET /api/reviews/:id` returns `photos[]` with `panelIndex`, `caption`, `annotated`, `urls`; bytes are never inlined; restore after reload is complete (SC-013)
- [ ] T112 [P] `backend/tests/integration/reviews/photos/file-serve.test.ts` — each `variant` returns the stored content type with `Content-Disposition: inline` and `Cache-Control: private`; `annotated` on an un-annotated photo is 404
- [ ] T113 [P] `frontend/tests/review/PhotoUploadField.test.tsx` — renders idle / 準備中 / 上傳中(progress+cancel) / 失敗(retry) / 空間已滿(disabled with reason) states; **no張數上限提示** (FR-048). **Plus the isolation property FR-058 actually asserts**: with three files uploading and the middle one failing, the other two still complete, the failed one keeps its原檔 and offers retry in place, and the already-typed 問題說明 in that panel is untouched — the failure must be scoped to one file
- [ ] T114 [P] `frontend/tests/review/PhotoThumb.test.tsx` — thumbnail, delete, caption edit, 「已標註」 badge as icon+text (constitution IX)

### Implementation

- [ ] T115 Implement `backend/src/reviews/photos/services/review-photo.service.ts` — own-review resolution from session; create-draft-if-absent (FR-050); status-preserving writes (FR-051); ceiling check before accepting bytes (FR-061) — makes T104/T105/T109 pass — depends on T096, T098
- [ ] T116 Implement `POST /photos` + `DELETE /photos/:photoId` + `PATCH /photos/:photoId` handlers with multipart parts `original`/`display`/`originalAsJpeg`/`panelIndex`/`caption` — makes T110 pass — depends on T099, T115
- [ ] T117 Implement `GET /photos/:photoId/file` — variant serving, stored content type, private cache — makes T112 pass — depends on T115
- [ ] T118 Amend `backend/src/reviews/services/review.service.ts` submit gate to read per-panel photo counts **inside the submit transaction**, and `backend/src/reviews/repositories/review.repository.ts` to expose that count within the same `$transaction` — makes T094/T106 pass. **Do not restructure the surrounding autosave path** (SC-018)
- [ ] T119 Extend the open payload in `backend/src/reviews/dto/review.dto.ts` with `photos[]`, captions sanitized on output (FR-047) — makes T111 pass
- [ ] T120 Extend `backend/src/reviews/services/review.service.ts` reset to delete photos via cascade and confirm no orphan blobs — makes T108 pass
- [ ] T121 [P] Implement `frontend/src/components/review/PhotoUploadField.tsx` — click + drag-drop on desktop; on mobile the plain file input so the OS offers 拍照／照片圖庫／瀏覽檔案; per-file state machine; storage-full state (makes T113 pass) — depends on T102, T103
- [ ] T122 [P] Implement `frontend/src/components/review/PhotoThumb.tsx` — thumb, ✕ delete, inline caption, 已標註 badge (makes T114 pass)
- [ ] T123 Implement `frontend/src/hooks/useReviewPhotos.ts` — **immediate** (non-debounced) mutations, kept structurally separate from `useAutosaveReview` (research D14)
- [ ] T124 Wire the photo block into `frontend/src/components/review/PanelReviewForm.tsx` (per-panel) and add the image-level block beside 其他意見 in `frontend/src/routes/ReviewWorkspacePage.tsx` (FR-045/FR-046) — depends on T121, T122, T123
- [ ] T125 Add the 📎 photo count to `frontend/src/components/review/PanelSwitcher.tsx` tabs, and mirror the photo-aware gate client-side so the UI never blocks what the server would accept (FR-049) — depends on T124
- [ ] T126 Implement `frontend/src/components/review/PhotoCompareLightbox.tsx` — original panel crop ↔ photo side by side, ←/→ between photos, Esc to close, download current, 看原圖 toggle (D1–D4) — depends on T122
- [ ] T127 `e2e/review-photos.spec.ts` — US8: attach a photo to 圖1 → reload and confirm restore → submit with that panel otherwise blank → verify the submitted review still shows the photo

**Checkpoint**: US8 fully delivered and independently testable.

---

## Phase 13: User Story 9 - 在站內為照片加上標註 (Priority: P3)

**Goal**: optional in-app annotation that writes a full-resolution flattened image plus re-editable state, never touching the original.

### Tests (write first — RED)

- [ ] T128 [P] `backend/tests/integration/reviews/photos/annotation-save.test.ts` — `PUT …/annotation` stores `annotated` + `annotationState`; the `original` bytes are **byte-identical** to what was uploaded (FR-052/SC-012); repeat saves overwrite with no version history (FR-056)
- [ ] T129 [P] `backend/tests/integration/reviews/photos/annotation-load.test.ts` — `GET …/annotation` deep-equals the saved state; a photo listing never carries it (SC-019)
- [ ] T130 [P] `backend/tests/integration/reviews/photos/annotation-submitted.test.ts` — annotating a photo on a `已提交` review preserves status and `submittedAt` (FR-051)
- [ ] T131 [P] `frontend/tests/review/AnnotateEntry.test.tsx` — the annotate control is present on desktop and mobile; the editor module is **not** imported until it is activated (research D17)

### Implementation

- [ ] T132 Implement `GET|PUT /photos/:photoId/annotation` handlers + service methods (makes T128–T130 pass) — depends on T115
- [ ] T133 [P] Create `frontend/src/features/annotate/filerobot-zh-TW.ts` — a project-owned zh-TW translation map covering every editor string (FR-055, constitution VIII)
- [ ] T134 Implement `frontend/src/features/annotate/AnnotateModal.lazy.tsx` — dynamic import boundary; `useBackendTranslations: false` with T133's map; loads the **original**; low `previewPixelRatio` for interaction, high `savingPixelRatio` for output; `onSave(image, designState)` → PUT; `loadableDesignState` on re-open (research D17) — depends on T132, T133
- [ ] T135 Implement the save-degradation path: if full-resolution output fails on a constrained device, retry at a lower ratio **while still persisting `annotationState`**, and surface a zh-TW notice (research D17, SC-019) — depends on T134
- [ ] T136 Show the annotated variant on the thumbnail with the 已標註 badge, and add the 看原圖 toggle in the lightbox (FR-052) — depends on T126, T134
- [ ] T137 `e2e/review-photos.spec.ts` — US9: annotate a photo → reopen and confirm the previous annotation loads → save again → original still retrievable and unchanged

**Checkpoint**: US9 delivered; annotation is optional and the photo-free path is untouched.

---

## Phase 14: Regression, Polish & Cross-Cutting

**These are the tasks that make「不影響舊資料」a test rather than a claim.**

- [ ] T138 `backend/tests/regression/existing-review-data.test.ts` — re-dump the corpus with T088's helper post-migration and assert **zero** differing rows across `overallJudgement`/`indicationJudgement`/`indicationNote`/`otherComment`/`status`/`submittedAt` and all four panels' fields (SC-017)
- [ ] T139 `backend/tests/regression/migration-additive.test.ts` — parse the new migration SQL and assert `ALTER TABLE` count is 0 and exactly two `CREATE TABLE` statements are present (FR-060)
- [ ] T140 Re-run the **pre-existing, unmodified** 003 suites — `backend/tests/{unit,integration}/reviews/` (excluding the new `photos/` folders) and `e2e/review.spec.ts` — and require a green run with **no edits to those files**. A test that needs changing is a signal the change was not additive (SC-018). This run is also what evidences **FR-053** — 「不使用標註功能時流程與現行完全相同」
- [ ] T141 [P] Add photo routes to the existing rate-limit configuration in `backend/src/middleware/rate-limit.ts` (constitution V)
- [ ] T142 [P] Verify captions are HTML-escaped on every output path alongside the existing free-text fields (FR-047, constitution V)
- [ ] T143 [P] Keyboard operability pass: upload trigger, delete, caption, annotate entry and lightbox navigation all reachable and operable by keyboard; 已標註 and storage-full states are icon+text, never colour-only (constitution IX, FR-054)
- [ ] T144 [P] Bundle check: confirm the Filerobot chunk is absent from the initial workspace load and only fetched on annotate; and that with the editor open **zero** requests leave the origin (FR-055, research D17)
- [ ] T145 Coverage gate — `npm run test:coverage -w backend` and the frontend equivalent ≥ 80 % including the new photo modules (constitution VII)
- [ ] T146 Walk `specs/003-reviewer-review-workflow/quickstart.md` §Amendment steps 1–10 end to end against a running stack and fix any drift

---

## Dependencies (amendment)

- **T088 → T089 → T090** is a hard chain; the SC-017 baseline is unrecoverable once migrated.
- Phase 11 blocks Phases 12 and 13.
- **US9 (Phase 13) depends on US8 (Phase 12)** — there is nothing to annotate until photos exist.
- T118 is the only edit inside pre-existing review code; T140 is its safety net.

## Parallel Opportunities (amendment)

- **Phase 11**: T086 ∥ T087 ∥ T091 ∥ T092 ∥ T093 ∥ T094 ∥ T100 ∥ T101; then the chain T089→T090→T096/T098.
- **Phase 12 tests**: T104–T114 are all `[P]` (different files).
- **Phase 12 impl**: T121 ∥ T122 (independent components) before T124 composes them.
- **Phase 13**: T128–T131 all `[P]`; T133 ∥ T132.
- **Phase 14**: T141 ∥ T142 ∥ T143 ∥ T144; T138/T139/T140 gate the release; T146 runs last.

## Implementation Strategy (amendment)

- **Increment 1** = Phase 11 + Phase 12 (US8). Stop and validate: a reviewer can attach photos, they survive reload, a photo alone satisfies the panel gate, and submitted reviews accept photos without regressing. This alone delivers the feature's core value.
- **Increment 2** = Phase 13 (US9). Annotation is additive and can ship later without blocking anything.
- **Gate before release** = Phase 14, specifically T138/T139/T140 — if any of the three fails, the change is not additive and must not ship.

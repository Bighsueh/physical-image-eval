---
description: "Task list for Feature 002 — Blueprint Catalog Ingestion"
---

# Tasks: Blueprint Catalog Ingestion（藍圖目錄匯入）

**Input**: Design documents from `/specs/002-blueprint-catalog-ingestion/`

**Prerequisites**: plan.md, spec.md, data-model.md, contracts/catalog-api.md, research.md, quickstart.md

**Prerequisite features**: **001 (accounts-auth)** — already established the monorepo skeleton (`backend/` + `frontend/` TS projects, Express app + middleware pipeline, Prisma init + first migration, Vite + Tailwind, `docker-compose.yml` with postgres + backend + frontend + the **read-only image mount**, Vitest + Playwright config + local scripts, `backend/src/lib/errors.ts` + response-envelope helper + zod base + **session/role middleware**). This feature's Setup/Foundational add **only** feature-specific scaffolding (catalog Prisma models + migration, parser deps, catalog constants/types) — it does NOT re-do the monorepo setup.

**Scope note**: Per the locked stack, Feature 002 touches `backend/` only (no `frontend/` UI). The catalog is the **read-only** domain (constitution XI): produced solely by the ingestion CLI, exposed by a **GET-only** read API. Browser-driven Playwright E2E is **N/A** here (no UI); the critical end-to-end flow (ingest valid source → read API returns the expected catalog) is covered by Vitest + supertest integration tests. UI E2E is deferred to 003.

**Tests**: REQUIRED (constitution VII — TDD, coverage ≥ 80%). For every user story, test tasks come BEFORE its implementation tasks and **MUST fail first** (RED → GREEN). Backend tests use Vitest + supertest against a disposable Postgres.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on another unfinished task)
- **[Story]**: `US1` / `US2` / `US3` traceability tag
- Every task names an exact file path under the real monorepo layout

---

## Phase 1: Setup (Feature-specific scaffolding)

**Purpose**: Add only the 002-specific tooling on top of 001's monorepo skeleton.

- [X] T001 [US1] Add markdown-parsing dependencies (`unified`, `remark-parse`, `mdast-util-to-string`, `unist-util-visit`, `@types/mdast`) and the `ingest` + `ingest:check` npm scripts (running `backend/src/ingestion/ingest.command.ts` via `tsx`) to `backend/package.json`; run `npm install` in `backend/`.
- [X] T002 [P] [US1] Extend `backend/src/config/env.ts` to require and validate `IMAGE_SOURCE_DIR` (non-empty, absolute or relative — resolved against the backend working directory — and readable) at startup alongside the existing `DATABASE_URL`/`PORT` (constitution V/X; FR-018 exit-2 precondition), **and add `IMAGE_SOURCE_DIR` (with a documenting comment) to `backend/.env.example`** so the backend starts cleanly once 002 lands.
- [X] T003 [P] [US2] Add catalog/image error codes `INVALID_PARAM`, `BLUEPRINT_NOT_FOUND`, `IMAGE_NOT_FOUND` (zh-TW messages) to the shared `backend/src/lib/errors.ts` (envelope `error.code` per contract §Common error codes).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Catalog data model + the single-source-of-truth constants and shared types every user story depends on.

**⚠️ CRITICAL**: No user-story work can begin until this phase is complete.

- [X] T004 [US1] Add `RegionCode` + `MappingKind` enums and `Region`, `Blueprint`, `Panel`, `Diagnosis` models to `backend/prisma/schema.prisma` with all constraints from data-model.md: `UNIQUE(regionCode)`, `UNIQUE(displayOrder)`; `UNIQUE(blueprintId)`, `UNIQUE(imagePath)`, index on `regionId` + `isHighRisk`, `aiPrompt`/`contentHash` columns; `UNIQUE(blueprintId, panelIndex)` + `panelIndex` 1..4 check; `UNIQUE(matrixNo)` + index on `mappedBlueprintId`.
- [X] T005 [US1] Generate the catalog migration: `npx prisma migrate dev --name catalog` → `backend/prisma/migrations/<ts>_catalog/migration.sql`; run `prisma generate` (depends on T004).
- [X] T006 [P] [US1] Create `backend/src/catalog/constants/catalog-constants.ts` exporting the **single named constants** — `HIGH_RISK_BLUEPRINT_IDS = {S4,T8,P1,P4,P5,K2,K3,K5,L3}` (FR-010/D6), `REGION_FOLDER_MAP` (`01_肩部→S` … `08_全身運動處方→Y`), `REGION_NAME_MAP` (regionCode → `nameZh`/`nameEn`/`displayOrder`).
- [X] T007 [P] [US1] Create `backend/src/ingestion/parser/types.ts` — zod-checked value objects `ParsedBlueprint`, `ParsedPanel`, `ParsedDiagnosis`, `ParsedIndex`, `ParsedCatalog` (shape contracts only, no DB) per research.md D1/D2.
- [X] T008 [P] [US2] Create `backend/src/ingestion/validation/report-types.ts` — `IngestReport`, `ReportError` (`{invariant, blueprintId?, panelIndex?, diagnosisNo?, message}`), `ReportWarning`, `ReportDiff` per research.md "Report shape".

**Checkpoint**: Schema migrated, constants + shared types exist — user stories can now begin.

---

## Phase 3: User Story 1 - 把唯讀來源匯成穩定的藍圖參考目錄 (Priority: P1) 🎯 MVP

**Goal**: Ingest the read-only source into a stable, correct catalog (blueprint set equals the index, every region non-empty, 4 panels each, non-empty metadata, diagnosis matrix numbers unique and contiguous, high-risk set) and expose it via the GET-only read API + read-only image route, with a zh-TW success report.

**Independent Test**: Ingest a complete valid source tree; assert the blueprint set equals the index's listed IDs, every region non-empty, 4 panels each with non-empty `動作說明`, non-empty overall metadata, diagnosis reconciliation (unique, contiguous matrix numbers), high-risk set, success report exit 0; then read the catalog through the API (`aiPrompt` absent, image streams PNG).

### Tests for User Story 1 (write FIRST — MUST FAIL before implementation) ⚠️

- [X] T009 [P] [US1] Build the **valid** 合成 fixture tree (8 region folders, blueprint `.md` files each with 整體資訊 + 4 `### N.` panels + AI prompt block, one placeholder `.png` per blueprint, one `00_藍圖總索引與設計規範.md` whose region tables and diagnosis matrix match the fixture) in `backend/tests/fixtures/source/valid/`.
- [X] T010 [P] [US1] Unit test the markdown parser (metadata + exactly 4 panels + `aiPrompt` + `contentHash`, robust to emoji/whitespace) in `backend/tests/unit/ingestion/markdown-parser.test.ts`.
- [X] T011 [P] [US1] Unit test the index parser (00 index → `ParsedDiagnosis[]` with `matrixNo`, `mappingKind` derived by Y-series rule, `mappedBlueprint`; referral rows; per-region blueprint ID sets) in `backend/tests/unit/ingestion/index-parser.test.ts`.
- [X] T012 [P] [US1] Unit test id-region (regex `^[SHETPKLY][1-9][0-9]?$`, folder↔letter cross-check, uniqueness) in `backend/tests/unit/ingestion/id-region.test.ts`.
- [X] T013 [P] [US1] Unit test invariants PASS on the valid parsed set + high-risk derivation equals the named constant in `backend/tests/unit/ingestion/invariants-pass.test.ts`.
- [X] T014 [US1] Integration test: full `ingest` against `fixtures/source/valid/` → `Blueprint` set equals the fixture index, every region non-empty, exactly 4 `Panel` per blueprint, non-empty metadata, `Diagnosis` rows matching the fixture index (mapped+template / referral), high-risk set, exit 0 + success report in `backend/tests/integration/ingestion/ingest-success.test.ts`.
- [X] T015 [P] [US1] Integration test the read API: `GET /api/regions` (8, ordered, `blueprintCount`), `GET /api/blueprints` (all catalog blueprints + `region`/`highRisk` filters), `GET /api/blueprints/:id` (4 ordered panels incl. `visualDescription`, `aiPrompt` **absent**), `GET /api/diagnoses` (all diagnoses + reconciliation `meta`), envelope shape, `401 AUTH_REQUIRED` without session in `backend/tests/integration/catalog-api/catalog-read.test.ts`.
- [X] T016 [P] [US1] Integration test the image route: `GET /api/blueprints/:id/image` streams `image/png`, `400 INVALID_PARAM` on bad id, `404 BLUEPRINT_NOT_FOUND`/`IMAGE_NOT_FOUND`, rejects path traversal, opens read-only in `backend/tests/integration/catalog-api/image-route.test.ts`.

### Implementation for User Story 1

- [X] T017 [P] [US1] Implement `backend/src/ingestion/source/source-reader.ts` — read-only directory walk (open with read flag only; never write/rename/move/delete), returns raw blueprint `.md` + index + png inventory (FR-001).
- [X] T018 [P] [US1] Implement `backend/src/ingestion/parser/id-region.ts` — ID regex validation, `REGION_FOLDER_MAP` cross-check, uniqueness (FR-022/D6).
- [X] T019 [P] [US1] Implement `backend/src/ingestion/parser/markdown-parser.ts` — `unified`+`remark-parse` mdast traversal → `ParsedBlueprint` (運動名稱/適應症/練習次數/溫馨小叮嚀 + 4 panels {stepName, actionDescription, timingHint?, visualDescription?} + version + aiPrompt + normalized `contentHash`) (FR-004/FR-006/FR-007/FR-016/FR-020/D1).
- [X] T020 [P] [US1] Implement `backend/src/ingestion/parser/index-parser.ts` — 00 index tables → `ParsedDiagnosis[]` + per-region blueprint ID sets; Y-series ⇒ `TEMPLATE`, non-Y ⇒ `MAPPED`, referral table ⇒ `REFERRAL` (FR-008/D2).
- [X] T021 [US1] Implement `backend/src/ingestion/validation/invariants.ts` — all fail-fast checks over the parsed set: blueprint set equals the index's listed IDs (FR-002: `FR-002:missing-blueprint` / `FR-002:unlisted-blueprint`), every region non-empty (FR-003: `FR-003:empty-region`), exactly 4 panels {1,2,3,4} (FR-004), single image + no bidirectional orphan (FR-005), non-empty indications/frequency/gentleReminder (FR-006), non-empty every `actionDescription` (FR-007), diagnosis matrix numbers unique and contiguous 1..N (FR-008: `FR-008:dup-matrixNo` / `FR-008:gap`), every non-referral `mappedBlueprint` resolves to an existing blueprint (FR-009), high-risk set == `HIGH_RISK_BLUEPRINT_IDS` exactly (FR-010), legal+unique IDs (FR-022), per-blueprint `涵蓋診斷` subset cross-check (D2) — returns `ReportError[]` (depends on T018, T020 + constants/types).
- [X] T022 [US1] Implement `backend/src/ingestion/validation/report.ts` — structured `IngestReport` builder + zh-TW human-readable success renderer (藍圖總數, per-region counts, reconciliation, high-risk set) (FR-012; depends on T021).
- [X] T023 [P] [US1] Implement `backend/src/ingestion/persistence/catalog-writer.ts` — one `prisma.$transaction([...])` snapshot-replace: clear catalog then insert `Region`/`Blueprint`/`Panel`/`Diagnosis` in a deterministic fixed order (FR-013/FR-017/D3/D4).
- [X] T024 [US1] Implement `backend/src/ingestion/ingest.command.ts` — `npm run ingest` entry: Phase A (source-reader → parsers → invariants → report) then, only if clean **and not `--check`**, Phase B (catalog-writer); when invoked with `--check`, run Phase A + report ONLY and short-circuit **before** opening the write transaction (no Phase B, 0 writes); print success report; exit 0 (FR-011/FR-017; depends on T017–T023).
- [X] T025 [P] [US1] Implement `backend/src/catalog/repositories/catalog.repository.ts` — Prisma read access: regions with blueprint counts, blueprint summary list (region/highRisk filters), blueprint detail with 4 panels + covered diagnoses, diagnosis matrix with filters + reconciliation aggregate.
- [X] T026 [P] [US1] Implement `backend/src/catalog/dto/blueprint-public.dto.ts` — allow-list public projection that **omits** `aiPrompt`, `contentHash`, `sourceMarkdownRef`; builds `imageUrl: /api/blueprints/:id/image` (FR-019/FR-020/D7).
- [X] T027 [US1] Implement `backend/src/catalog/services/catalog.service.ts` — compose repository + DTO: region list, blueprint list (filters), blueprint detail, diagnosis list (filters) with `meta` reconciliation (depends on T025, T026).
- [X] T028 [US1] Implement `backend/src/catalog/controllers/catalog.controller.ts` — zod-validate query/path params (`region` enum, `blueprintId` regex, `mappingKind` enum, `highRisk` boolean), wrap results in the response envelope, map errors to codes (depends on T027).
- [X] T029 [US1] Implement `backend/src/catalog/routes/catalog.routes.ts` — `GET /api/regions`, `GET /api/blueprints`, `GET /api/blueprints/:blueprintId`, `GET /api/diagnoses`, all behind 001's session middleware (constitution IV; depends on T028).
- [X] T030 [US1] Implement `backend/src/images/routes/image.routes.ts` — `GET /api/blueprints/:blueprintId/image`: resolve stored `imagePath` under `IMAGE_SOURCE_DIR`, assert resolved path stays in root (no traversal), open read-only, stream `image/png` with `ETag`/`Cache-Control` (FR-001/D5; depends on T025).
- [X] T031 [US1] Register the catalog router + image router into the Express app in `backend/src/app.ts` under the session middleware (depends on T029, T030).

**Checkpoint**: A valid source ingests to a correct, queryable, read-only catalog — MVP complete and independently testable.

---

## Phase 4: User Story 2 - 驗證不變量失敗時 fail-fast、絕不寫入半套並產出可讀報告 (Priority: P1)

**Goal**: On any invariant violation, the ingest aborts before any DB write (0 rows persisted), leaves a prior catalog intact, proves the source dir is never modified, and prints a zh-TW report that locates the failing invariant by `blueprintId`/`panelIndex`/`diagnosisNo`.

**Independent Test**: Run several each-broken source trees (one invariant violated each) and assert: every run exits non-zero, 0 catalog rows change, the report names the failing invariant + location, and the source files' content + mtime are unchanged.

### Tests for User Story 2 (write FIRST — MUST FAIL before implementation) ⚠️

- [X] T032 [P] [US2] Build each-broken fixture trees (one invariant violated each) under `backend/tests/fixtures/source/broken-*/`: `broken-3-panels`, `broken-5-panels`, `missing-metadata`, `empty-action`, `orphan-blueprint`, `orphan-image`, `missing-blueprint`, `unlisted-blueprint`, `recon-dup-matrixNo`, `recon-matrix-gap`, `recon-referral-points-blueprint`, `highrisk-extra`, `highrisk-missing`, `illegal-id`, `duplicate-id`, `region-empty`.
- [X] T033 [P] [US2] Parametrized integration test: each broken fixture → exit code 1, `SELECT count(*)` for all four tables unchanged (0 persisted), report names the failing invariant + `blueprintId`/`panelIndex`/`diagnosisNo` in `backend/tests/integration/ingestion/fail-fast.test.ts` (FR-011/SC-002/SC-004).
- [X] T034 [P] [US2] Integration test: seed a good catalog, then ingest a broken source → prior catalog rows fully intact (no partial overwrite) in `backend/tests/integration/ingestion/no-partial-overwrite.test.ts` (FR-015); **also assert `npm run ingest -- --check` on a VALID source prints the success report, exits 0, and persists 0 rows (existing catalog unchanged)** in `backend/tests/integration/ingestion/check-dry-run.test.ts`.
- [X] T035 [P] [US2] Integration test: snapshot every source file's content hash + mtime before/after both a passing and a failing ingest → zero changes in `backend/tests/integration/ingestion/source-readonly.test.ts` (FR-001/SC-005).
- [X] T036 [P] [US2] Integration test: missing/unreadable `IMAGE_SOURCE_DIR` → exit code 2, no catalog overwrite in `backend/tests/integration/ingestion/source-missing.test.ts` (FR-018).
- [X] T037 [P] [US2] Unit test invariants FAILURE cases — each invariant returns a located `ReportError` (invariant id + position) in `backend/tests/unit/ingestion/invariants-fail.test.ts`.

### Implementation for User Story 2

- [X] T038 [US2] Extend `backend/src/ingestion/validation/invariants.ts` to collect a located `ReportError` for every violation (no throwing; one entry per failed invariant with `blueprintId`/`panelIndex`/`diagnosisNo`) covering FR-002..FR-010, FR-022 and edge cases (duplicate/illegal ID, unknown folder, multi-image) (depends on T021).
- [X] T039 [US2] Extend `backend/src/ingestion/validation/report.ts` with the zh-TW **failure** renderer — errors rendered distinctly from warnings, each located (FR-012/FR-021/SC-004; depends on T038).
- [X] T040 [US2] Harden `backend/src/ingestion/ingest.command.ts` exit codes & fail-fast: exit 1 on validation failure with Phase B never entered (0 rows), exit 2 on unreadable/missing source, exit 3 on transaction error (rollback, prior catalog intact); report to stdout only, never into the source dir (FR-011/FR-015/FR-017/FR-018/D8; depends on T024).
- [X] T041 [US2] Add read-only guard + missing/unreadable detection to `backend/src/ingestion/source/source-reader.ts` (open read-only; surface a typed "source unreadable" error driving exit 2) (FR-001/FR-018; depends on T017).

**Checkpoint**: Every invariant violation aborts cleanly with a located report; source proven untouched; prior catalog preserved.

---

## Phase 5: User Story 3 - 來源更新後可冪等重跑並取得變更與報告 (Priority: P2)

**Goal**: Re-running on unchanged source yields an equivalent catalog (no duplicates/drift); when the source changes, the catalog refreshes and the report summarizes the added/modified/removed diff; a failing re-run never partially overwrites the prior catalog.

**Independent Test**: Ingest the same unchanged source twice → equivalent catalog, empty diff; then ingest a single-point change → only that item changes and the report summarizes it; a re-run that violates an invariant aborts with the prior catalog intact.

### Tests for User Story 3 (write FIRST — MUST FAIL before implementation) ⚠️

- [X] T042 [P] [US3] Build changed-source fixtures `changed-metadata-edit` (one blueprint metadata text edited) and `changed-diagnosis-remap` (one diagnosis remapped) under `backend/tests/fixtures/source/changed-*/`.
- [X] T043 [P] [US3] Integration test: ingest unchanged source twice → catalog equivalent, no duplicates, diff `added/modified/removed` all empty in `backend/tests/integration/ingestion/idempotent.test.ts` (FR-013/SC-003).
- [X] T044 [P] [US3] Integration test: re-ingest `changed-metadata-edit` → only that blueprint changes (others unchanged), report `modified=[id]` in `backend/tests/integration/ingestion/rerun-change.test.ts` (FR-014/SC-007).
- [X] T045 [P] [US3] Integration test: re-ingest `changed-diagnosis-remap` → diagnosis matrix reflects new mapping, diff summarizes the change in `backend/tests/integration/ingestion/rerun-diagnosis.test.ts` (FR-014).
- [X] T046 [P] [US3] Integration test: re-run on a now-invalid source aborts, prior catalog unchanged, failure report in `backend/tests/integration/ingestion/rerun-fail.test.ts` (FR-015).
- [X] T047 [P] [US3] Unit test `snapshot-diff` (added/removed by `blueprintId`, modified by `contentHash`, diagnosis change by `matrixNo`) in `backend/tests/unit/ingestion/snapshot-diff.test.ts`.

### Implementation for User Story 3

- [X] T048 [US3] Implement `backend/src/ingestion/diff/snapshot-diff.ts` — read the existing catalog snapshot and compute `added/modified/removed` vs the parsed set keyed by `blueprintId` + per-blueprint `contentHash`, plus diagnosis change by `matrixNo` (FR-014/D4).
- [X] T049 [US3] Wire the diff into `backend/src/ingestion/ingest.command.ts` (compute pre-replace, attach to report) and extend `backend/src/ingestion/validation/report.ts` with the zh-TW diff section (FR-014/SC-007; depends on T048, T040).
- [X] T050 [US3] Make `backend/src/ingestion/persistence/catalog-writer.ts` snapshot-replace fully deterministic/ordered so re-runs produce byte-equivalent rows with no drift/duplicates (FR-013/SC-003/D4; depends on T023).

**Checkpoint**: Re-runs are idempotent; real changes refresh the catalog with an accurate diff; failed re-runs preserve the prior catalog.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Warnings, coverage, docs, security, and the full quickstart validation across all stories.

- [X] T051 [P] Implement FR-021 warnings in `backend/src/ingestion/validation/report.ts` (empty `timingHint`/`visualDescription`, 0 covered diagnoses) kept distinct from fatal errors, with a unit test in `backend/tests/unit/ingestion/warnings.test.ts`.
- [X] T052 [P] Run `npm run test:coverage` in `backend/` and close gaps to ≥ 80% across `src/ingestion/**` and `src/catalog/**` (constitution VII).
- [X] T053 [P] Document `npm run ingest` / `npm run ingest -- --check`, exit codes (0/1/2/3), and required env in `backend/README.md` (mirrors contract §6).
- [X] T054 Run the full `quickstart.md` validation end-to-end (ingest valid → read-API checks → idempotent re-run → fail-fast on a broken fixture → source-unchanged proof) to confirm SC-001..SC-007.
- [X] T055 [P] Security pass (constitution V): confirm no hardcoded secrets, all query/path params validated against allow-sets, `aiPrompt`/`contentHash` never serialized (grep the DTO + API responses), and the image route's traversal guard holds.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: depends only on 001's monorepo skeleton — start immediately.
- **Foundational (Phase 2)**: depends on Phase 1 — **BLOCKS all user stories** (schema/migration, constants, shared types).
- **US1 (Phase 3)**: depends on Phase 2. The MVP; delivers the catalog + read API.
- **US2 (Phase 4)**: depends on Phase 2; builds on US1's parser/invariants/command/writer (extends them for the failure path). Independently testable via broken fixtures.
- **US3 (Phase 5)**: depends on Phase 2; builds on US1's command/writer and US2's hardened exit codes (adds diff + idempotency). Independently testable via re-runs.
- **Polish (Phase 6)**: depends on all targeted user stories being complete.

### Per-Story Dependencies

- **US1 (P1)**: no dependency on US2/US3 — the foundation every later feature reviews against.
- **US2 (P1)**: extends US1 modules (invariants T038←T021, report T039←T022, command T040←T024, source-reader T041←T017) but is verified independently with each-broken fixtures.
- **US3 (P2)**: extends US1/US2 (diff T048 new; command T049←T040; writer T050←T023) but verified independently with idempotent/changed re-runs.

### Within Each User Story (order)

- Tests → models/types → parsers/services → validation/report → persistence/writer → command/endpoints → app wiring/integration.
- Tests MUST be written and MUST FAIL before the matching implementation (RED → GREEN).

### Within-Story key chains

- **US1**: T009–T016 (tests) → {T017, T018, T019, T020, T023, T025, T026} → T021 → T022 → T024 (ingest command) ; {T027 → T028 → T029} + T030 → T031 (app).
- **US2**: T032–T037 (tests) → T038 → T039 → T040 ; T041.
- **US3**: T042–T047 (tests) → T048 → T049 ; T050.

## Parallel Opportunities

- **Phase 1**: T002, T003 run in parallel (different files); T001 first (owns `backend/package.json`).
- **Phase 2**: after T004→T005 (schema then migration), T006, T007, T008 run in parallel.
- **US1 tests**: T009, T010, T011, T012, T013, T015, T016 all `[P]` (T014 shares the ingest integration harness).
- **US1 impl**: T017, T018, T019, T020, T023, T025, T026 all `[P]` (distinct files); the ingestion read-API tracks (`T025→T027→T028→T029`/`T030`) and the parser→invariant→command track run in parallel until T031 joins them.
- **US2 tests**: T032–T037 all `[P]`. **US3 tests**: T042–T047 all `[P]`.
- **Cross-story**: once Phase 2 is done, US1, US2-test-fixtures, and US3-test-fixtures can be drafted in parallel by different developers; US2/US3 implementation lands after the US1 modules they extend exist.
- **Polish**: T051, T052, T053, T055 `[P]`; T054 (full quickstart run) last.

## Coverage Map (every artifact has tasks)

- **Entities** — `Region` T004/T006/T025 · `Blueprint` T004/T019/T025 · `Panel` T004/T019/T025 · `Diagnosis` T004/T020/T025 · enums `RegionCode`/`MappingKind` T004.
- **Endpoints** — `GET /api/regions` T029(impl)/T015(test) · `GET /api/blueprints` T029/T015 · `GET /api/blueprints/:id` T029/T015 · `GET /api/diagnoses` T029/T015 · `GET /api/blueprints/:id/image` T030/T016 · ingestion CLI T024/T040/T014/T033.
- **User stories** — US1 → Phase 3 · US2 → Phase 4 · US3 → Phase 5; all acceptance scenarios covered by the listed integration tests; SC-001..SC-007 closed by T014/T033/T034/T035/T043/T044/T054.

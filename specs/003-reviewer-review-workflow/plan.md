# Implementation Plan: 審查者審查流程（Reviewer Review Workflow）

**Branch**: `003-reviewer-review-workflow` | **Date**: 2026-06-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-reviewer-review-workflow/spec.md`

## Summary

Feature 003 is the **product core**: it owns the **review domain** — the only data a
reviewer creates or edits. A logged-in 審查者 reviews all 51 AIGC exercise-education
blueprints, one at a time, in a left/right **Layout A** screen (sticky zoomable PNG +
full read-only blueprint metadata on the left; pinned 整體判定 + 適應症 + four stacked
panel forms + prev/next + save-draft + submit on the right). A review's identity is the
pair (reviewer × blueprint), unique. The backend owns two tables — `Review` and its
exactly-four `PanelReview` rows — plus five review enums. Multi-select panel sets
(`requiredWarnings`, `problemTypes`) are stored as **native Postgres enum array columns**
(small, bounded, always read/written with their parent row), not join tables. Input is
**autosaved** via a debounced `PATCH` of the whole draft: autosave persists 草稿 and **never**
elevates to 已提交 and **never** regresses 已提交→草稿. **Submit** requires a non-null
整體判定 (else the inline zh-TW message 請先選擇整體判定 blocks it) and then **auto-advances**
to the next unreviewed blueprint in the deterministic order (Region `displayOrder` →
numeric blueprint id), skipping 已提交; 51/51 is a completion state, never a dead end.
Edit-after-submit is an in-place overwrite that refreshes `lastUpdatedAt` — **no** version
history, **no** 已修訂 state. Every read/write is scoped to the session reviewer (own data
only). The catalog (002) is consumed **read-only**: blueprint metadata + four panels incl.
`畫面視覺描述`, `isHighRisk` from the single shared `HIGH_RISK_BLUEPRINT_IDS` constant —
`aiPrompt` is never serialized. The high-risk caution is informational and non-blocking.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 22 — backend (Express) and frontend
(React + Vite). Both sides ship in this feature.

**Primary Dependencies**: Backend — Express, Prisma (PostgreSQL client + `enum[]` array
columns), zod (boundary validation of params/query/body, enum + array-member + length
checks). Reuses 001's `require-auth` / `require-role('REVIEWER')` / CSRF middleware and the
`{ success, data, error, meta }` envelope, and 002's catalog read service + the
`blueprint-public` projection (which already excludes `aiPrompt`) and
`HIGH_RISK_BLUEPRINT_IDS`. Frontend — React Router (routes `/progress`, `/review/:blueprintId`),
TanStack Query (open / autosave / submit / progress / next), Tailwind CSS, a small
debounce util for autosave; inline zoom/pan via CSS transform (no lightbox library).

**Storage**: PostgreSQL via Prisma (dev `5433→5432`). This feature owns two tables —
`Review`, `PanelReview` — and five enums (`OverallJudgement`, `IndicationJudgement`,
`WarningType`, `ProblemType`, `ReviewStatus`); see [data-model.md](./data-model.md). It
references `Account` (001) and `Blueprint`/`Panel`/`Region` (002) read-only; it writes no
catalog or auth row, and no image bytes.

**Testing**: Vitest (unit: deterministic next-unreviewed ordering, status machine,
per-reviewer isolation, zod schemas, orphan-text preservation, enum↔zh-TW mapping),
supertest (integration over all five routes incl. negative / role / CSRF / cross-reviewer
isolation / autosave-no-regress), RTL (Layout A components, autosave hook, keyboard nav),
Playwright (E2E: US1–US7). TDD, coverage ≥ 80%.

**Target Platform**: Linux server containers behind Cloudflared in prod
(`https://your-domain.example.com`); desktop/laptop browsers for the React SPA. Dev on
localhost.

**Project Type**: web (monorepo `backend/` + `frontend/`, single git repo). This feature
touches both sides.

**Performance Goals**: Reviewer-scale is small (a handful of clinicians). Targets: open a
blueprint for review p95 < 120 ms (one indexed `(reviewerId, blueprintId)` lookup + a
cached catalog read); autosave `PATCH` p95 < 100 ms (single transaction: upsert review +
replace 4 panels); progress page p95 < 100 ms (one grouped count over ≤ 51 rows/reviewer).
A clean-image keyboard-only review completes in ≤ 15 s (SC-001).

**Constraints**: Autosave never elevates 草稿→已提交 and never regresses 已提交→草稿
(FR-025/FR-026); submit hard-requires `overallJudgement` (FR-011/SC-003); all-empty panels
are a valid 通過 (FR-018/SC-004); auto-advance is deterministic (Region `displayOrder` →
numeric id) and skips 已提交 (FR-027–FR-029); 51/51 is non-dead-end (FR-029/SC-008);
per-reviewer isolation — `reviewerId` is taken **only** from the session, never the request
(FR-003/SC-010); orphan free-text is preserved (FR-019/SC-002); high-risk badge is
icon+text, never color-only, never blocking (FR-033–FR-035); `aiPrompt` never reaches the
reviewer (FR-009); full keyboard operability (FR-037/FR-038/SC-011). Free text sanitized on
output; CSRF on every mutation; secrets via env validated at startup.

**Scale/Scope**: Per reviewer: 0..51 `Review` rows, each with exactly 4 `PanelReview`
(≤ 204 panel rows/reviewer). Endpoints: 3 GET + 1 PATCH + 1 POST = 5 routes, all
reviewer-role, own-data only. Frontend: 2 routes (progress, review workspace) + the Layout A
component set + autosave/keyboard hooks.

## Constitution Check

*GATE: evaluated before Phase 0 research and re-checked after Phase 1 design. No violations.*

| # | Principle | How this feature satisfies it |
|---|-----------|-------------------------------|
| I | Spec-First Authority | Every entity, route, enum, and rule below traces to a numbered FR/SC (identity → FR-001; isolation → FR-003/SC-010; Layout A → FR-004/FR-005; zoom → FR-006; read-only text + visualDescription, no aiPrompt → FR-007/FR-009; fields → FR-010–FR-020; autosave/status machine → FR-022–FR-026; submit/advance/completion → FR-011/FR-027–FR-030; reopen-edit → FR-032; high-risk → FR-033–FR-036; keyboard → FR-037/FR-038; progress → FR-039–FR-042). No element exists without a spec line. **PASS** |
| II | Read-Only External Image Data | 003 reads no source file and writes none. The PNG is served only by 002's read-only blueprint-keyed image route; 003 stores no image bytes and no source path. **PASS (no filesystem writes)** |
| III | No Open Registration | N/A — 003 adds no account/registration/invite surface; it consumes the session 001 issues. **PASS (not applicable)** |
| IV | Least-Privilege, Server-Enforced Roles | All `/api/reviews/*` require `require-auth` + `require-role('REVIEWER')` at the server boundary; 系統管理員 (who never review) get `403 FORBIDDEN_ROLE`. `reviewerId` is resolved from the session, never from body/params, so a reviewer can only ever read/write their own (reviewer×blueprint) rows (SC-010). Frontend hiding is defense-in-depth only. **PASS** |
| V | Security Baseline | zod validates every boundary against fixed sets (blueprintId regex, enum members, array-member enums + dedupe, free-text length caps). Prisma parameterized only. Orphan free-text is preserved but **sanitized on output** (XSS). CSRF on PATCH/POST. No secrets in code; none in logs. **PASS** |
| VI | Immutability & Small-File Discipline | Layered routes→controllers→services→repositories; the draft writer replaces the 4 panels inside one transaction (new rows) rather than ad-hoc field mutation; frontend draft state uses an immutable reducer. Many small files (parser-free; ordering, status machine, schema, dto, repository each < 400 lines). **PASS** |
| VII | Test-First, ≥ 80% | TDD per acceptance scenario: unit (ordering, status machine, isolation, schema, orphan text), supertest integration (5 routes + negative/role/CSRF/isolation/no-regress), Playwright E2E US1–US7. Coverage gate ≥ 80%. **PASS** |
| VIII | Traditional Chinese Only | All labels, enum values (通過／需小修／需重做; 合理／有疑慮; 注意跌倒／需有專人幫助指導／骨鬆注意／心肺功能不全者注意／其它; 部位／主題錯誤…有錯字; 草稿／已提交), validation copy (請先選擇整體判定), soft prompts and badges are zh-TW verbatim. `error.code` is machine English; `error.message` is zh-TW. No language switcher. **PASS** |
| IX | Accessibility & Clinician Readability | The full single-blueprint review path (focus 整體判定 → choose → submit → advance) is keyboard-only (FR-037/SC-011); inline zoom has keyboard controls. The high-risk caution and review-status badges convey state by **icon + text**, never color alone (FR-034). Predictable focus order; desktop/laptop first. **PASS** |
| X | Fixed Environment Constraints | Dev ports 5180 / 3100 / 5433→5432; prod via Cloudflared at `https://your-domain.example.com`; the session cookie from 001 is reused as-is. No new port introduced. **PASS** |
| XI | Catalog / Review Domain Separation | 003 **is** the review (mutable) domain. It creates/edits only `Review`/`PanelReview` and never writes a `Region`/`Blueprint`/`Panel`/`Diagnosis` (002) or `Account`/`Session` (001) row. It consumes the catalog through 002's read API/service and the shared `HIGH_RISK_BLUEPRINT_IDS` constant — no redefinition. **PASS** |

**Result: PASS — no violations.**

## Project Structure

### Documentation (this feature)

```text
specs/003-reviewer-review-workflow/
├── plan.md              # This file
├── research.md          # Phase 0 — key technical decisions
├── data-model.md        # Phase 1 — Review / PanelReview + review enums
├── quickstart.md        # Phase 1 — run & validate locally end-to-end
├── contracts/
│   └── review-api.md    # Phase 1 — reviewer REST contract (5 routes)
└── tasks.md             # Phase 2 — created by /speckit-tasks (NOT here)
```

### Source Code (repository root) — concrete paths this feature adds

```text
backend/
├── prisma/
│   ├── schema.prisma                              # + Review, PanelReview models;
│   │                                              #   + enums OverallJudgement / IndicationJudgement /
│   │                                              #     WarningType / ProblemType / ReviewStatus (@map zh-TW)
│   └── migrations/<ts>_review/migration.sql
├── src/
│   └── reviews/
│       ├── routes/review.routes.ts                # GET /api/reviews/progress | /next | /:blueprintId ;
│       │                                          #   PATCH /api/reviews/:blueprintId ;
│       │                                          #   POST /api/reviews/:blueprintId/submit
│       ├── controllers/review.controller.ts       # thin: validate → service → envelope
│       ├── services/
│       │   ├── review.service.ts                  # open / autosave / submit; status machine; isolation
│       │   ├── review-progress.service.ts         # x/51, draft count, per-region, filterable index
│       │   └── review-ordering.ts                 # next-unreviewed: displayOrder → numeric id, skip 已提交
│       ├── repositories/review.repository.ts      # Prisma: upsert Review + replace 4 PanelReview in one $transaction
│       ├── dto/review.dto.ts                       # reviewer projection: composes 002 blueprint-public (no aiPrompt)
│       │                                          #   + enum ↔ zh-TW mapping
│       └── validation/review.schema.ts            # zod: params (blueprintId), query (region/status),
│                                                  #   autosave/submit body (enums, arrays, length caps)
└── tests/
    ├── unit/reviews/                              # ordering, status machine, isolation, schema, orphan-text
    └── integration/reviews/                       # supertest 5 routes + role/CSRF/isolation/no-regress/restore

frontend/
├── src/
│   ├── routes/
│   │   ├── ReviewProgressPage.tsx                 # 已提交 x/51, draft count, per-region, region/status filter + jump (FR-039/040/042)
│   │   └── ReviewWorkspacePage.tsx                # Layout A; route /review/:blueprintId (US1–US6)
│   ├── components/review/
│   │   ├── ReviewLayout.tsx                       # left/right split; left column sticky (FR-004/FR-005)
│   │   ├── ZoomableImage.tsx                      # inline zoom/pan + keyboard, fit default, NO lightbox (FR-006)
│   │   ├── BlueprintMetaPanel.tsx                 # read-only: 適應症/練習次數/溫馨小叮嚀 + 4 panels'
│   │   │                                          #   步驟名/動作說明/時間提示/畫面視覺描述 (FR-007/FR-009)
│   │   ├── HighRiskBadge.tsx                      # icon + text, non-color-only, non-blocking (FR-033–FR-035)
│   │   ├── TopProgressBar.tsx                     # fixed-top 已提交 x/51 (FR-041)
│   │   ├── OverallJudgementField.tsx              # radio 通過/需小修/需重做 + inline 請先選擇整體判定 (FR-010/FR-011)
│   │   ├── IndicationField.tsx                    # 合理/有疑慮 + 適應症說明, optional (FR-012)
│   │   ├── PanelReviewForm.tsx                    # per-panel multi-selects + free text (FR-013–FR-020)
│   │   └── SubmitBar.tsx                          # prev/next, save-draft state, submit + soft prompt (FR-030)
│   ├── hooks/
│   │   ├── useAutosaveReview.ts                   # debounced PATCH; never submit; restore on mount (FR-022–FR-026)
│   │   └── useReviewKeyboard.ts                   # focus order + shortcuts; full keyboard path (FR-037/FR-038)
│   ├── state/reviewDraft.ts                       # immutable reducer for the in-progress draft
│   └── api/reviews.ts                             # TanStack Query: openReview / autosave / submit / progress / next
└── tests/                                          # Vitest + RTL: components, autosave hook, keyboard nav

e2e/
└── review.spec.ts                                 # Playwright: US1 圖文並陳, US2 乾淨圖鍵盤快路徑(≤15s),
                                                   #   US3 autosave restore + 不回退, US4 提交需整體判定 + 自動前進 + 51/51,
                                                   #   US5 重開修訂, US6 高風險警示, US7 個人進度頁
```

**Structure Decision**: web monorepo. Backend follows the locked layered shape
(routes → controllers → services → repositories) with zod at the boundary and Prisma at
the data layer; the only DB-touching write is a single transaction that upserts the
`Review` and snapshot-replaces its 4 `PanelReview` rows (deterministic, idempotent
autosave). Catalog data is reached only through 002's read service/DTO so `aiPrompt` can
never leak. The frontend adds exactly two routes (progress + the Layout A workspace) and a
small component/hook set; the autosave hook is the single owner of the debounced draft
`PATCH` and is structurally incapable of calling submit.

## Complexity Tracking

No violations. No deviation from the constitution or the locked stack requires
justification.

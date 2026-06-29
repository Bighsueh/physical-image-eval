# Implementation Plan: 管理員儀表板與匯出（Admin Dashboard & Export）

**Branch**: `004-admin-dashboard-export` | **Date**: 2026-06-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-admin-dashboard-export/spec.md`

## Summary

Feature 004 gives the 系統管理員 a **read-only** governance surface over the review and
catalog domains: a dashboard that shows overall completion, per-reviewer progress, per-image
coverage + judgement distribution, and a per-image cross-reviewer drill-down that surfaces
disagreement; plus a CSV export of every **submitted** (reviewer × image) record to feed the
image-fixing team. This feature **owns no stored entity** — it adds two purely-derived read
projections, `ReviewProgress` and `ExportRecord`, computed live from `Account` (001),
`Region`/`Blueprint`/`Panel` (002), and `Review`/`PanelReview` (003). It **never** mutates a
review: every endpoint is `GET`, there is no write path, and the export is a pure read.

Two invariants drive the design. **(1) Active-basis consistency** — the overall completion
ratio, per-image coverage, and per-image judgement distribution all use a single basis
(active reviewers' submitted records). 非在職（disabled）reviewers' submissions are kept and
surfaced **separately** (a distinct count + a 非在職 flag in drill-down and export) and are
**never** added to the active-ratio numerator, so numerator and denominator always share the
same basis and the three headline numbers can never contradict each other (FR-002/016/022).
**(2) Draft exclusion** — only `status = 已提交` rows enter any statistic or the export
(FR-007/015). Aggregation is done with read-only Prisma `groupBy`/`count`; the export is
serialized to UTF-8 CSV **with a BOM** for Excel zh-TW, one row per submitted record, with
multi-select sets encoded as delimited lists, explicit flag columns (高風險、含需重做、
在職／非在職), and CSV-formula-injection neutralization on every free-text cell (FR-020).

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 22 (backend Express read endpoints; frontend
React + Vite admin pages).

**Primary Dependencies**: Express + Prisma (PostgreSQL) for read aggregation (`groupBy`,
`count`, `findMany` — **no** raw SQL, no SQL views in v1), zod for query/path-param boundary
validation, the 001 session/role middleware (`require-auth`, `require-role('ADMIN')`), the
001 `lib/envelope.ts` + `lib/errors.ts`, and the 002 `HIGH_RISK_BLUEPRINT_IDS` constant
(single source of truth — never re-declared here). CSV is serialized in-house (small,
dependency-free RFC-4180 writer with BOM + injection guard) — no CSV library needed. Frontend:
React Router + TanStack Query (all queries are `GET`) + Tailwind. Testing: Vitest + supertest
(backend), Vitest + React Testing Library (frontend), Playwright (E2E).

**Storage**: PostgreSQL via Prisma — **read-only** for this feature. 004 adds **no table, no
migration, no enum**. It reads `Review`/`PanelReview` (003), `Account` (001),
`Region`/`Blueprint`/`Panel` (002). It relies on (but does not create) indexes on
`Review(reviewerId, status)`, `Review.reviewerId`, `Review.blueprintId` (003), and
`Account(isActive)` (001) — to keep aggregation cheap.

**Testing**: Vitest unit (active-basis completion ratio, multi-select encoder, CSV serializer
incl. injection neutralization + RFC-4180 escaping, disagreement derivation, empty-state),
supertest integration (all five GET routes: envelope shape, 401 without session, 403 for
reviewer role, filters, drafts-excluded, 非在職 separation, CSV bytes incl. BOM + headers),
Playwright E2E (admin: overview → image filter → drill-down → CSV download; reviewer blocked
403). TDD, coverage ≥ 80%.

**Target Platform**: Linux server containers (backend + Postgres) behind Cloudflared in prod;
desktop/laptop browsers for the React admin dashboard. Dev on localhost.

**Project Type**: web (monorepo `backend/` + `frontend/`, single git repo).

**Performance Goals**: Corpus is tiny — ≤ a few dozen reviewers × 51 blueprints ⇒ low
thousands of `Review` rows. Dashboard aggregate endpoints p95 < 150 ms (indexed `groupBy`
over `Review`); drill-down p95 < 100 ms (one blueprint's submitted rows); full CSV export
(every submitted row + 4 panels each) builds and streams in < 1 s. No pagination pressure;
list endpoints still ship a `meta` envelope.

**Constraints**: Strictly read-only over the review domain — **no** POST/PUT/PATCH/DELETE
route exists in this feature, and no code path writes a `Review`/`PanelReview` (constitution
XI, FR-012, SC-007). Admin-only: `require-role('ADMIN')` gates every route at the server
boundary; reviewer role → `403 FORBIDDEN_ROLE` (FR-001). Active-basis ratio never exceeds
100%; 非在職 submissions excluded from the numerator (FR-002/016). Free text (適應症說明、
警語－其它、問題說明、displayName) is treated as untrusted: HTML-escaped for dashboard JSON
display and formula-injection-neutralized for CSV (FR-020). 高風險／需重做／覆蓋 badges carry
text or icon, never color alone (constitution IX, FR-024). Secrets via env, validated at
startup (no new secret introduced by this feature).

**Scale/Scope**: 5 endpoints (4 dashboard GET + 1 export GET). Frontend: 4 admin pages
(overview, per-reviewer, per-image, drill-down) + an export trigger + filter controls. Fixed
corpus of 51 blueprints; high-risk set of 9; three overall-judgement values; two
indication-judgement values.

## Constitution Check

*GATE: must pass before research; re-checked after design. No violations.*

| # | Principle | How this feature satisfies it |
|---|-----------|-------------------------------|
| I | Spec-First Authority | Every endpoint, projection field, and rule traces to a numbered FR/SC (overview→FR-002/016/022; reviewers→FR-003/004; images→FR-005/006/009/010/011; drill-down→FR-008/018; export→FR-013..FR-017/020; read-only→FR-012). No capability exists without a spec line. |
| II | Read-Only External Image Data | N/A as a writer — 004 touches no image source file. It only references catalog rows + 002's existing read-only image route; it never opens, writes, renames, or deletes anything under `04_運動圖解藍圖`. |
| III | No Open Registration | N/A — 004 creates no account/registration surface. The dashboard reads accounts but exposes **no** create/edit/disable control (those belong to 001). |
| IV | Least-Privilege, Server-Enforced Roles | `require-auth` + `require-role('ADMIN')` gate all `/api/admin/dashboard/*` and `/api/admin/export/*` routes at the server boundary; a reviewer session always gets `403 FORBIDDEN_ROLE` (FR-001, SC-007). Admin never reviews; frontend hiding is defense-in-depth only. |
| V | Security Baseline | zod-validated params against fixed allow-sets (`blueprintId` regex, boolean filter flags); Prisma parameterized aggregation (no raw SQL); free text HTML-escaped on JSON output and **formula-injection-neutralized** in CSV (leading `= + - @ tab CR` guarded, fields RFC-4180 quoted — FR-020, SC-002 §4); no secrets in code; no sensitive data logged; generic `INTERNAL_ERROR` on unexpected failure. |
| VI | Immutability & Small-File Discipline | Projections are built by pure functions returning new objects (no mutation of source rows); layered routes → controllers → services → repositories with many small files (ratio helper, CSV serializer, multi-select encoder, DTO builders) each < 400 lines. |
| VII | Test-First, ≥ 80% | TDD: unit (ratio/CSV/encoder/disagreement/empty-state), supertest integration (all 5 routes + role/auth/filters/draft-exclusion/CSV bytes), Playwright E2E for the admin stories. Coverage gate ≥ 80%. |
| VIII | zh-TW Only | All labels, badges, column headers, and **CSV cell enum values** are 繁體中文 verbatim per FR-019 (通過／需小修／需重做；合理／有疑慮；the 5 警語 + 6 問題類型). `error.code` stays machine-English; `error.message` is zh-TW. No language switcher. |
| IX | Accessibility & Clinician Readability | 高風險／含需重做／未達全覆蓋 badges render icon + text, never color-only (FR-024). Primary monitor + filter + drill-down + export operations are fully keyboard-operable; clear focus order; desktop/laptop first. |
| X | Fixed Environment Constraints | Dev ports backend 3100 / frontend 5180 / Postgres 5433→5432. Prod via Cloudflared; reuses 001's `Secure; SameSite=Lax` session cookie bound to `your-domain.example.com`. No new port introduced. |
| XI | Catalog / Review Domain Separation | 004 is a **read-only consumer** of both domains and a writer of neither. It never edits catalog data and never mutates review data — every endpoint is `GET` and the export is a pure projection (FR-012, SC-007). |

**Result: PASS — no violations.**

## Project Structure

### Documentation (this feature)

```text
specs/004-admin-dashboard-export/
├── plan.md              # This file
├── research.md          # Phase 0 — key technical decisions
├── data-model.md        # Phase 1 — ReviewProgress / ExportRecord derived projections
├── quickstart.md        # Phase 1 — run & validate locally
├── contracts/
│   └── dashboard-export-api.md   # Phase 1 — admin read API + CSV export contract
└── tasks.md             # Phase 2 — created later by /speckit-tasks (NOT here)
```

### Source Code (paths this feature adds)

```text
backend/
├── prisma/
│   └── schema.prisma                              # UNCHANGED by 004 (no table/enum/migration added)
├── src/
│   └── admin-dashboard/
│       ├── routes/
│       │   ├── admin-dashboard.routes.ts          # GET overview | reviewers | images | images/:blueprintId
│       │   └── admin-export.routes.ts             # GET export/reviews.csv
│       ├── controllers/
│       │   ├── admin-dashboard.controller.ts      # envelope-wraps service output
│       │   └── admin-export.controller.ts         # sets CSV headers + streams body
│       ├── services/
│       │   ├── progress.service.ts                # overview / per-reviewer / per-image / drill-down projections
│       │   ├── export.service.ts                  # builds ExportRecord[] (submitted-only, active+非在職 flagged)
│       │   └── completion-ratio.ts                # active-basis numerator/denominator/percent (FR-002/016/022)
│       ├── repositories/
│       │   └── review-read.repository.ts          # READ-ONLY Prisma groupBy/count/findMany over Review/PanelReview
│       ├── dto/
│       │   ├── dashboard.dto.ts                   # overview/reviewer/image/drilldown DTOs (no aiPrompt, sanitized)
│       │   └── export-record.dto.ts              # one (reviewer × image) export row shape
│       ├── csv/
│       │   ├── csv-serializer.ts                  # RFC-4180 + UTF-8 BOM + formula-injection guard
│       │   └── multiselect-encode.ts             # delimited-list encoder for warning/problem sets
│       └── constants/
│           └── dashboard-constants.ts             # CSV delimiter + column order + judgement label maps
│                                                  #   (imports HIGH_RISK_BLUEPRINT_IDS from 002 catalog-constants)
└── tests/
    ├── unit/admin-dashboard/                      # ratio, csv-serializer (incl. injection), encoder, disagreement, empty-state
    ├── integration/admin-dashboard/              # supertest: 5 routes + 401/403 + filters + draft-exclusion + CSV bytes
    └── e2e-helpers/                               # seed reviewers + submitted/draft reviews for fixtures

frontend/
├── src/
│   ├── routes/admin/dashboard/
│   │   ├── DashboardOverviewPage.tsx              # overall completion + summary cards (FR-002/016/022)
│   │   ├── ReviewerProgressPage.tsx               # per-reviewer table (submitted/51, unreviewed, last submit)
│   │   ├── ImageCoveragePage.tsx                  # per-image coverage + distribution + filters + export
│   │   └── ImageDrillDownPage.tsx                 # /admin/dashboard/images/:blueprintId cross-reviewer view
│   ├── components/admin/dashboard/
│   │   ├── CompletionSummary.tsx                  # active ratio + 非在職 separate line
│   │   ├── ReviewerProgressTable.tsx
│   │   ├── ImageCoverageTable.tsx
│   │   ├── ImageFilters.tsx                       # 含需重做 / 高風險 / 尚未達全覆蓋 (keyboard-operable)
│   │   ├── JudgementDistribution.tsx              # 通過／需小修／需重做 counts
│   │   ├── CrossReviewerTable.tsx                 # drill-down disagreement (v1: surface only)
│   │   ├── HighRiskBadge.tsx                      # icon + text, never color-only (FR-024)
│   │   └── ExportButton.tsx                       # triggers CSV download (GET, attachment)
│   ├── api/
│   │   ├── admin-dashboard.ts                     # TanStack Query GET hooks
│   │   └── admin-export.ts                        # CSV download trigger (fetch → blob → save)
│   └── lib/
│       └── inactive-label.ts                      # 在職／非在職 label helper
└── tests/                                          # Vitest + RTL: tables, filters, badges, export trigger

e2e/
└── admin-dashboard.spec.ts                         # Playwright: admin overview→drill-down→export; reviewer 403
```

**Structure Decision**: web app, monorepo. 004 adds a single self-contained backend module
`admin-dashboard/` (layered routes → controllers → services → repositories) that **only
reads**, plus a frontend `routes/admin/dashboard/` area. It reuses 001's auth/role middleware
and envelope helpers, 002's `HIGH_RISK_BLUEPRINT_IDS` and image route, and 003's
`Review`/`PanelReview` models — adding no table, no migration, and no write path.

## Complexity Tracking

No violations. No deviations from the constitution or the locked stack require justification.

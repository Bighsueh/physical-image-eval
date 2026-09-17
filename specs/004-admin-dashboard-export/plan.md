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

**Performance Goals**: Corpus is tiny — ≤ a few dozen reviewers × the blueprint catalog ⇒ low
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
(overview, per-reviewer, per-image, drill-down) + an export trigger + filter controls. Blueprint
count taken from the ingested catalog; high-risk set of 9; three overall-judgement values; two
indication-judgement values.

## Constitution Check

*GATE: must pass before research; re-checked after design. No violations.*

| # | Principle | How this feature satisfies it |
|---|-----------|-------------------------------|
| I | Spec-First Authority | Every endpoint, projection field, and rule traces to a numbered FR/SC (overview→FR-002/016/022; reviewers→FR-003/004; images→FR-005/006/009/010/011; drill-down→FR-008/018; export→FR-013..FR-017/020; read-only→FR-012). No capability exists without a spec line. |
| II | Read-Only External Image Data | N/A as a writer — 004 touches no image source file. It only references catalog rows + 002's existing read-only image route; it never opens, writes, renames, or deletes anything under the `IMAGE_SOURCE_DIR` source dir. |
| III | No Open Registration | N/A — 004 creates no account/registration surface. The dashboard reads accounts but exposes **no** create/edit/disable control (those belong to 001). |
| IV | Least-Privilege, Server-Enforced Roles | `require-auth` + `require-role('ADMIN')` gate all `/api/admin/dashboard/*` and `/api/admin/export/*` routes at the server boundary; a reviewer session always gets `403 FORBIDDEN_ROLE` (FR-001, SC-007). Admin never reviews; frontend hiding is defense-in-depth only. |
| V | Security Baseline | zod-validated params against fixed allow-sets (`blueprintId` regex, boolean filter flags); Prisma parameterized aggregation (no raw SQL); free text HTML-escaped on JSON output and **formula-injection-neutralized** in CSV (leading `= + - @ tab CR` guarded, fields RFC-4180 quoted — FR-020, SC-002 §4); no secrets in code; no sensitive data logged; generic `INTERNAL_ERROR` on unexpected failure. |
| VI | Immutability & Small-File Discipline | Projections are built by pure functions returning new objects (no mutation of source rows); layered routes → controllers → services → repositories with many small files (ratio helper, CSV serializer, multi-select encoder, DTO builders) each < 400 lines. |
| VII | Test-First, ≥ 80% | TDD: unit (ratio/CSV/encoder/disagreement/empty-state), supertest integration (all 5 routes + role/auth/filters/draft-exclusion/CSV bytes), Playwright E2E for the admin stories. Coverage gate ≥ 80%. |
| VIII | zh-TW Only | All labels, badges, column headers, and **CSV cell enum values** are 繁體中文 verbatim per FR-019 (通過／需小修／需重做；合理／有疑慮；the 5 警語 + 6 問題類型). `error.code` stays machine-English; `error.message` is zh-TW. No language switcher. |
| IX | Accessibility & Clinician Readability | 高風險／含需重做／未達全覆蓋 badges render icon + text, never color-only (FR-024). Primary monitor + filter + drill-down + export operations are fully keyboard-operable; clear focus order; desktop/laptop first. |
| X | Fixed Environment Constraints | Dev ports backend 3100 / frontend 5180 / Postgres 5433→5432. Prod via Cloudflared; reuses 001's `Secure; SameSite=Lax` session cookie bound to the production domain (`COOKIE_DOMAIN`). No new port introduced. |
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
│   │   ├── ReviewerProgressPage.tsx               # per-reviewer table (submitted/N, unreviewed, last submit)
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

---

# Amendment 2026-08-27 — 參考照片的管理端呈現（FR-025..FR-037 / SC-011..SC-017）

Additive to everything above. **004's defining property is preserved**: it still writes
nothing — no table, no enum, no migration — and every route stays `ADMIN`-only, `GET`-only
and CSRF-free.

## Summary (delta)

The per-image page becomes a **修圖工作台**: the blueprint on one side, and on the other,
四個分格 groups where each submitting reviewer's judgement, problem annotations and photos
for that panel sit together — because the admin's real task is deciding how to fix the image,
panel by panel. Panels where everyone signed off collapse to a line. The image list gains a
photo-count column and a `hasPhotos` filter so the admin can see at a glance which blueprints
have material waiting. A per-image **ZIP** (still a `GET`, streamed, no temp files) delivers
原檔 + 標註版 with filenames that encode 圖 × 分格 × 審查者 × 版本別. The CSV gains two
**appended** columns so the table and the archive can be read together. A storage panel shows
used/ceiling with an 80 % warning.

**The invariant this amendment is really about**: photos reach the admin **only** through
`已提交` reviews. Draft photos are invisible in the work table, the count column, the bundle
and the export (FR-028) — closing a side door that FR-007 ("drafts never enter statistics or
export") does not cover on its own.

## Technical Context (delta)

**Primary Dependencies (added)**: a streaming ZIP writer for route 8 — chosen so the archive
is produced without a temporary file, keeping 004 filesystem-free (research D12). No image
library: 004 never decodes or resizes anything, it streams stored bytes.

**Storage (delta)**: still **read-only, zero migrations**. 004 additionally reads 003's
`ReviewPhoto` (metadata + denormalized byte sizes) and, only when streaming a file or a
bundle, `ReviewPhotoBlob` by primary key. The storage aggregate is a `SUM` over
`ReviewPhoto`'s byte columns and never touches the blob table (003 research D11). It relies
on — but does not create — 003's `(reviewId, panelIndex, sortOrder)` index.

**Testing (delta)**: unit — work-table grouping/`allClear` derivation, bundle naming and
composition (incl. the HEIC→`originalAsJpeg` substitution), storage-threshold arithmetic,
the appended CSV columns' escaping and formula-neutralization (D5 unchanged); integration —
the four new routes, plus a dedicated **draft-photo exclusion suite** asserting 0 leakage
across all four surfaces (SC-012), `hasPhotos` filter correctness, empty-blueprint zip,
and 405/404 for every mutating verb (SC-016); E2E — admin opens the work table, downloads
the bundle, cross-checks a CSV row against the archive. Plus a **regression suite**: the old
CSV header must be a strict prefix of the new one and existing columns byte-identical
(SC-014), and the pre-existing 004 suites must pass **unmodified**.

**Constraints (delta)**: every photo query joins through `Review.status = 已提交`
(FR-028) — filtering at the join, not per caller, so the exclusion is structural; the bundle
stays a `GET` (FR-012/SC-007); no existing CSV column is renamed, reordered or retyped
(FR-035/SC-014); the ceiling is displayed here but enforced **only** by 003's upload route
(FR-037) — nothing in 004 blocks anything.

**One documented exception**: `PhotoStorageUsage.usedBytes` counts **all** photos, drafts
included, because it measures disk consumption rather than review progress. Every other photo
number on the dashboard is submitted-only. Called out here so it is not later read as an
inconsistency with FR-028.

## Constitution Check (re-evaluated)

| # | Principle | Delta assessment |
|---|-----------|------------------|
| I | Spec-First Authority | Every new projection, route and column traces to FR-025..FR-037 / SC-011..SC-017. **PASS** |
| II | Read-Only External Image Data | 004 reads no source file and writes none; the bundle is streamed from database rows. **PASS** |
| III | No Open Registration | N/A. **PASS** |
| IV | Least-Privilege, Server-Enforced Roles | New routes carry the same `adminReadRateLimiter` + `requireAuth` + `requireRole('ADMIN')` + `requirePasswordCurrent` chain; reviewers get 403. A draft photo's id returns 404, identical to an unknown id, so the error code itself confirms nothing (FR-028). **PASS** |
| V | Security Baseline | Captions and panel free text are treated as untrusted and sanitized on output (FR-020); the CSV's new filename column goes through the same RFC-4180 escaping and formula-injection neutralization as every other free-text column (research D5); files are served with their stored, validated content type; bundle entry names are derived from server-side data, never from user-supplied filenames; admin read routes remain rate-limited. **PASS** |
| VI | Immutability & Small-File Discipline | New code lands as a `photos/` slice beside the existing dashboard services; projections are built fresh per request and never written back. **PASS** |
| VII | Test-First, ≥ 80% | TDD per US5 acceptance scenario, plus the draft-exclusion suite and the SC-014 append-only export regression. **PASS** |
| VIII | Traditional Chinese Only | New copy (「附照片」「只看有附照片」「下載本圖全部材料」「已用 X GB／10 GB」) and the two new CSV headers (`參考照片張數`、`參考照片檔名`) are zh-TW verbatim. **PASS** |
| IX | Accessibility & Clinician Readability | The work table's per-panel state is conveyed by text + icon (「3 位皆無問題」/「2 位標了問題」), never colour alone; the storage warning states the number, not just a colour change; download and filter controls are keyboard-operable (FR-024 unchanged). **PASS** |
| X | Fixed Environment Constraints | No new port, container or volume. **PASS** |
| XI | Catalog / Review Domain Separation | 004 reads 003's photo tables and writes nothing anywhere. **PASS** |

**Result: PASS — no violations.**

## Source Code (delta) — paths this amendment adds

```text
backend/
├── prisma/schema.prisma                                # STILL UNCHANGED by 004
├── src/
│   ├── config/env.ts                                   # reads PHOTO_STORAGE_LIMIT_BYTES (owned by 003)
│   └── admin-dashboard/
│       ├── routes/admin-dashboard.routes.ts            # + GET images/:id/worktable | photos/:id/file
│       │                                               #   | images/:id/photos.zip | storage
│       ├── controllers/admin-photo.controller.ts       # work table, file stream, zip stream, storage
│       ├── services/
│       │   ├── work-table.service.ts                   # 已提交-only join → PanelGroup[4] + allClear
│       │   ├── photo-bundle.service.ts                 # naming rule + composition (原始/標註/originalAsJpeg)
│       │   └── photo-storage.readonly.ts               # SUM over ReviewPhoto byte columns + thresholds
│       ├── repositories/photo-read.repository.ts       # READ-ONLY; every query starts from Review(已提交)
│       ├── csv/export-photo-columns.ts                 # the two APPENDED columns only
│       └── dto/work-table.dto.ts                       # ImageWorkTable / PanelGroup / ReviewerEntry / PhotoRef
└── tests/
    ├── unit/admin-dashboard/photos/                    # grouping, allClear, bundle naming, thresholds, csv append
    └── integration/admin-dashboard/photos/             # 4 routes + draft-exclusion(×4 surfaces) + hasPhotos
                                                        #   + empty zip + mutating-verb rejection + csv prefix

frontend/
├── src/
│   ├── routes/admin/dashboard/ImageDrillDownPage.tsx   # becomes the work table (original + per-panel groups)
│   ├── components/admin/dashboard/
│   │   ├── PanelGroup.tsx                              # header counts + collapsed all-clear + reviewer entries
│   │   ├── ReviewerEntry.tsx                           # judgement pills, notes, photo thumbs, per-entry download
│   │   ├── BundleDownloadButton.tsx                    # 下載本圖全部材料
│   │   ├── PhotoCountCell.tsx                          # 附照片 column
│   │   └── StorageUsagePanel.tsx                       # 已用／上限 + 80% warning
│   └── api/admin-dashboard.ts                          # + worktable / storage / bundle URL / hasPhotos filter
└── tests/                                               # RTL: grouping, collapsed panels, storage thresholds

e2e/
└── admin-photos.spec.ts                                # US5: work table → bundle → CSV cross-check;
                                                        #   draft photos absent everywhere
```

**Structure Decision (delta)**: the photo read paths land as a **separate `photos/` slice**
with their own repository, whose every query starts from `Review` filtered to `已提交`.
Concentrating that filter in one repository is what makes FR-028 structural rather than a
rule four call sites must remember — and it is the difference between SC-012 being provable
and being hoped for. The CSV change is confined to an append-only column module so the
existing serializer (and therefore SC-014) is untouched.

## Complexity Tracking (delta)

No violations. One dependency added (a streaming ZIP writer) and justified in research D12:
streaming keeps the archive off disk, which is what lets 004 remain a feature with no
filesystem interaction and no state-changing route.

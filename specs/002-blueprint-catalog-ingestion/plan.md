# Implementation Plan: Blueprint Catalog Ingestion（藍圖目錄匯入）

**Branch**: `002-blueprint-catalog-ingestion` | **Date**: 2026-06-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-blueprint-catalog-ingestion/spec.md`

## Summary

Feature 002 owns the **catalog domain**: the read-only reference data every later feature reviews against. An idempotent, all-or-nothing ingestion command parses the READ-ONLY source dir (51 blueprint `.md`, the `00_藍圖總索引與設計規範.md` index, and 51 `.png`), validates a fixed set of fail-fast invariants, and writes four catalog tables — `Region`, `Blueprint`, `Panel`, `Diagnosis` — inside a single Prisma transaction. The source dir is never written. A read API (Express + Prisma) exposes regions, blueprints (metadata + 4 panels + covered diagnoses + `isHighRisk`), and a read-only image route; the internal-only `aiPrompt` is stored but never serialized into any API response. The technical approach: parse-and-validate entirely in memory (pure functions), emit a structured + human-readable report, and only on a fully-valid result open one transaction that snapshot-replaces the catalog (guaranteeing idempotent re-run and no half-written state).

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 22 (backend only; no frontend work in this feature).

**Primary Dependencies**: Express (HTTP), Prisma (PostgreSQL ORM + migrations), zod (boundary validation of query/path params and of parsed-record shapes), `remark` / `remark-parse` + `unified` (markdown → mdast AST traversal for deterministic field extraction), Vitest + supertest (tests). Ingestion is a `npm run ingest` CLI entry, not an HTTP endpoint.

**Storage**: PostgreSQL (dev port `5433→5432`). Catalog rows only — image PNG **bytes are never stored**; rows store a relative `imagePath`/`sourceMarkdownRef`. Source images are served read-only by the backend from a mounted directory.

**Testing**: Vitest (unit: parser, index-parser, invariants, diff, high-risk derivation), supertest (catalog read API integration), a test Postgres (Testcontainers or a disposable compose DB) for repository/transaction tests. Fixtures: one synthetic valid source tree plus several each-broken trees (one invariant violated each). TDD, coverage ≥ 80%.

**Target Platform**: Linux server container (Docker). Backend container receives a **read-only bind mount** of the external source image dir. Prod via Cloudflared at `https://your-domain.example.com`.

**Project Type**: web (monorepo `backend/` + `frontend/`). This feature touches `backend/` only.

**Performance Goals**: Ingestion of the full corpus (51 blueprints ≈ 204 panels + 134 diagnoses) completes in < 5 s wall-clock on a dev laptop. Catalog read endpoints respond < 50 ms p95 (single-digit-thousand rows, served from Postgres). Image route streams 1–2 MB PNGs read-only.

**Constraints**: Strictly read-only source access (no write/rename/move/delete at any code path); fail-fast all-or-nothing (0 rows persisted on any invariant failure); idempotent re-run (identical source ⇒ equivalent catalog, no duplicates/drift); high-risk set referenced from a single named constant; `aiPrompt` never exposed to reviewers.

**Scale/Scope**: Fixed, small, authoritative corpus — 8 regions, 51 blueprints, exactly 4 panels each, 134 diagnoses (128 mapped + 6 referral). Scope does not grow with users; it changes only when the source dir is updated and re-ingested.

## Constitution Check

*GATE: evaluated before Phase 0 research and re-checked after Phase 1 design. No violations.*

- **I. Spec-First Authority**: Every entity, invariant, and endpoint below traces to a numbered FR/SC in `spec.md` (e.g. counts → FR-002/FR-003, 4 panels → FR-004, reconciliation → FR-008/FR-009, high-risk → FR-010, fail-fast → FR-011/FR-017, idempotency → FR-013, internal aiPrompt → FR-020). No design element exists without a spec line. **PASS**
- **II. Read-Only External Image Data**: Ingestion opens source files read-only, performs all parsing/validation in memory, and writes only to Postgres + a report sink **outside** the source dir. The image route resolves a blueprint-keyed path and streams bytes read-only; no client-supplied path reaches the filesystem. Tests assert source file content + mtime are unchanged after both success and failure runs (SC-005). **PASS**
- **III. No Open Registration**: N/A to catalog domain — this feature creates no account/registration surface of any kind. **PASS (not applicable)**
- **IV. Least-Privilege, Server-Enforced Roles**: Catalog reads require an authenticated session (either role); enforced by the same server-side session middleware defined in 001. Ingestion is an operator CLI, not a user-facing route, and exposes no privilege escalation. **PASS**
- **V. Security Baseline**: No secrets in code (DB URL + source-dir path via env, validated present at startup). Path/query params validated against fixed allow-sets (`blueprintId` regex `^[SHETPKLY][1-9][0-9]?$`, `regionCode` enum). Prisma parameterized access only. Free-text catalog fields sanitized on output. Image route rejects any non-catalog path (no traversal). **PASS**
- **VI. Immutability & Small-File Discipline**: Parser/validator/diff are pure functions returning new values; the catalog writer replaces a snapshot rather than mutating rows in place. Code is split into many small files (parser, index-parser, id-region, invariants, report, diff, writer, repository, controller, routes, dto) each < 400 lines. **PASS**
- **VII. Test-First, Coverage ≥ 80%**: TDD per acceptance scenario; unit + integration + (catalog read) E2E-able fixtures; each fail-fast invariant has a dedicated red test using an each-broken fixture tree. **PASS**
- **VIII. Traditional Chinese Only**: All user-facing strings — region `nameZh`, blueprint/panel content, the human-readable report, warning/error messages — are zh-TW. Enum labels (對應種類 已對應／通用處方模板／轉介) match the source/index verbatim. **PASS**
- **IX. Accessibility & Clinician Readability**: `isHighRisk` is a boolean field plus (in 003's UI) a textual/iconic badge — never color-only. The catalog exposes the data that makes non-color signaling possible. **PASS**
- **X. Fixed Environment Constraints**: Dev ports 5180/3100/5433→5432 honored; backend gets a read-only volume mount via `docker-compose.yml`; prod Cloudflared domain respected. **PASS**
- **XI. Catalog / Review Domain Separation**: This feature is the catalog domain. It is produced **only** by ingestion/re-run; no endpoint or path lets a user create/edit a `Region`/`Blueprint`/`Panel`/`Diagnosis`. The read API is GET-only. Review-domain rows (003) reference catalog by `blueprintId` but are never written here. **PASS**

**Result: no violations.** See Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/002-blueprint-catalog-ingestion/
├── plan.md              # This file
├── research.md          # Phase 0 — key technical decisions
├── data-model.md        # Phase 1 — Region/Blueprint/Panel/Diagnosis logical model
├── quickstart.md        # Phase 1 — run & validate locally
├── contracts/
│   └── catalog-api.md   # Phase 1 — read API + ingestion command interface
└── tasks.md             # Created later by /speckit-tasks (NOT here)
```

### Source Code (repository root) — concrete paths this feature adds

```text
backend/
├── prisma/
│   ├── schema.prisma                         # + Region, Blueprint, Panel, Diagnosis models, RegionCode/MappingKind enums
│   └── migrations/<ts>_catalog/migration.sql
├── src/
│   ├── catalog/
│   │   ├── routes/catalog.routes.ts          # GET /api/regions, /api/blueprints, /api/blueprints/:id, /api/diagnoses
│   │   ├── controllers/catalog.controller.ts
│   │   ├── services/catalog.service.ts
│   │   ├── repositories/catalog.repository.ts # Prisma read access
│   │   ├── dto/blueprint-public.dto.ts        # public projection — EXCLUDES aiPrompt
│   │   └── constants/catalog-constants.ts     # HIGH_RISK_BLUEPRINT_IDS, REGION_COUNTS, REGION_FOLDER_MAP
│   ├── ingestion/
│   │   ├── ingest.command.ts                  # `npm run ingest` entry; exit codes; report sink
│   │   ├── source/source-reader.ts            # read-only dir walk (open with read flag only)
│   │   ├── parser/markdown-parser.ts          # remark mdast → ParsedBlueprint (metadata + 4 panels + aiPrompt)
│   │   ├── parser/index-parser.ts             # 00 index tables → ParsedDiagnosis[] + mapping
│   │   ├── parser/id-region.ts                # ID regex, region-letter ↔ folder cross-check
│   │   ├── validation/invariants.ts           # all fail-fast checks (counts, panels, orphans, reconciliation, high-risk)
│   │   ├── validation/report.ts               # structured report builder + human-readable renderer
│   │   ├── diff/snapshot-diff.ts              # added/modified/removed vs existing catalog
│   │   └── persistence/catalog-writer.ts      # single Prisma $transaction snapshot-replace
│   ├── images/
│   │   └── routes/image.routes.ts             # GET /api/blueprints/:id/image — read-only PNG stream
│   └── config/env.ts                          # validates DATABASE_URL, IMAGE_SOURCE_DIR at startup
└── tests/
    ├── unit/ingestion/                        # parser, index-parser, invariants, diff, id-region
    ├── integration/catalog-api/               # supertest GET endpoints + image route
    ├── integration/ingestion/                 # transaction all-or-nothing + idempotent re-run + read-only assertion
    └── fixtures/source/                       # valid tree + each-broken trees (one invariant each)
```

**Structure Decision**: Layered backend (routes → controllers → services → repositories) for the read API, plus a separate `ingestion/` module that is pure-function-first (source-reader → parser → invariants → report/diff → writer) so validation is fully testable without a database and the only DB-touching step is the final transactional writer. `frontend/` is untouched (002 has no UI per the locked stack).

## Complexity Tracking

No violations. No deviations from the constitution or the locked stack require justification.

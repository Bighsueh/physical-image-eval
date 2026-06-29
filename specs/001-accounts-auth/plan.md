# Implementation Plan: 帳號與登入（Accounts & Auth）

**Branch**: `001-accounts-auth` | **Date**: 2026-06-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-accounts-auth/spec.md`

## Summary

Feature 001 establishes the access-control foundation for the whole tool: exactly two
strictly-separated roles（系統管理員 / 審查者）, admin-only account lifecycle
（建立／停用／啟用／憑證重設）, server-side session login with a cookie, and **zero**
self-registration surface anywhere. Authentication uses an opaque, server-side session
persisted in Postgres (cookie carries only an opaque token); passwords are hashed with
argon2id; credential reset emits a one-time temporary password that forces a change on
first login and revokes all prior sessions. The first 系統管理員 is created by a
deploy-time, idempotent bootstrap seed — never through any registration flow. Every
protected capability is authorized at the server boundary via role middleware; the
frontend ships only login + (admin) account-management + forced-password-change screens.
Account-management operations（建立／停用／重設）write an immutable audit trail.

## Technical Context

**Language/Version**: TypeScript 5.x on Node 22 (backend Express; frontend React + Vite).

**Primary Dependencies**: Express, Prisma (PostgreSQL client), zod (boundary validation),
`@node-rs/argon2` (argon2id password + temp-password hashing), `express-rate-limit`
(auth-endpoint throttling), `cookie` parsing via Express; frontend React Router +
TanStack Query + Tailwind CSS. Node `crypto` for opaque session-token and temp-password
generation. No third-party auth/session library — sessions are owned tables.

**Storage**: PostgreSQL via Prisma. This feature owns three tables — `Account`,
`Session`, `AuditLog` (see [data-model.md](./data-model.md)). Session token is stored as a
SHA-256 hash; the raw token lives only in the httpOnly cookie. No image bytes, no catalog
data.

**Testing**: Vitest (unit: services, hashing, session lifecycle), supertest (API
integration over the Express app against a test Postgres / Testcontainers), Playwright
(E2E: login → 0／51 landing, generic-failure parity, admin create→login, no-registration
scan, disable/reset session invalidation). TDD, coverage ≥ 80%.

**Target Platform**: Linux server containers (backend + Postgres) behind Cloudflared in
prod; desktop/laptop browsers for the React frontend. Dev on localhost.

**Project Type**: web (separate `backend/` + `frontend/`, monorepo, single git repo).

**Performance Goals**: Auth is low-volume (small team, 數人–數十人). Targets: login p95 <
300 ms excluding the deliberate argon2id cost (~50–150 ms tuned); `session/me` p95 < 50 ms
(single indexed lookup); account list p95 < 100 ms. argon2id parameters tuned to ≈ 100 ms
per verify on the deploy hardware.

**Constraints**: Generic auth-failure response with constant-time behavior regardless of
whether the username exists / is active (no observable timing or body difference —
SC-004). Cookie `httpOnly + Secure + SameSite=Lax`, no JS access; `Secure` + domain bound
to `your-domain.example.com` in prod. CSRF protection on every cookie-authenticated
mutation. Rate limiting on `/api/auth/login`. Secrets (DB URL, bootstrap-admin creds,
cookie/session config) via env, validated present at startup. No secrets or passwords in
logs. All boundary input validated by zod against fixed allowed sets (role enum, ids).

**Scale/Scope**: ≲ a few dozen accounts; typically 1–3 admins. Each reviewer account maps
to 0..51 Reviews (owned by feature 003). Endpoints: 4 auth + 6 admin-account = 10 routes.
Frontend screens: Login, Forced-password-change, Admin account list/create/manage. No
pagination pressure expected, but list endpoint still ships a `meta` envelope.

## Constitution Check

*GATE: must pass before research; re-checked after design. No violations.*

| # | Principle | How this feature satisfies it |
|---|-----------|-------------------------------|
| I | Spec-First Authority | Every route, entity, and rule below traces to a spec FR (FR-001..FR-023) or a constitution principle; no capability exists without a spec line. |
| II | Read-Only External Image Data | N/A to auth — this feature touches no image source dir and writes no files there. No code path in 001 reads or writes `04_運動圖解藍圖`. |
| III | No Open Registration | There is **no** register/signup/apply route, controller, link, form, or reachable path. Account creation exists only under `POST /api/admin/accounts` (role ADMIN). First admin is a deploy-time seed, not an endpoint. US3 E2E scan asserts registration-entry count = 0 (SC-002). |
| IV | Least-Privilege, Server-Enforced Roles | Two roles only (`ADMIN`/`REVIEWER`). `requireRole('ADMIN')` middleware gates all `/api/admin/*`; reviewers can never reach account management or others' data. Admin accounts are never counted as reviewers (cross-ref 004). Frontend hiding is defense-in-depth only (SC-001/SC-008). |
| V | Security Baseline | argon2id hashing; generic `帳號或密碼錯誤` on every auth failure (constant-time, FR-004/SC-004); Prisma parameterized access (no raw SQL); zod-validated boundaries; rate-limited login (FR-021); env-only secrets validated at startup; no passwords/tokens/session-ids in logs; CSRF on mutations. |
| VI | Immutability & Small-File Discipline | Layered routes → controllers → services → repositories, many small files (≤ ~200–400 lines). Session/account state changes create new rows or return new objects (e.g. revoke = set `revokedAt`, never destructive rewrite of history); audit log is append-only. |
| VII | Test-First, ≥ 80% | TDD: unit (services/hashing/session), supertest integration (all 10 routes incl. negative/role/CSRF/rate-limit), Playwright E2E for the five user stories. Coverage gate ≥ 80%. |
| VIII | zh-TW Only | All user-facing copy in 繁體中文: login error `帳號或密碼錯誤`, `請重新登入`, `首次登入請變更密碼`, `帳號識別碼已存在`, button/label text. Error `code` fields are machine English; `message` shown to users is zh-TW. No language switcher. |
| IX | Accessibility & Clinician Readability | Login + password-change forms fully keyboard-operable; validation/error state conveyed by text (not color alone); labels associated to inputs; desktop/laptop first. |
| X | Fixed Environment Constraints | Dev ports backend 3100 / frontend 5180 / Postgres 5433→5432. Prod via Cloudflared; cookie `Secure` + `Domain=your-domain.example.com`, `SameSite=Lax`. New ports verified free before declaring. |
| XI | Catalog / Review Domain Separation | 001 owns auth tables (`Account`, `Session`, `AuditLog`) — part of the **mutable** domain. It never creates or edits catalog-domain data (Region/Blueprint/Panel/Diagnosis, owned by 002). `Account` is referenced by Review (003) but 001 does not define Review. |

**Result: PASS — no violations.**

## Project Structure

### Documentation (this feature)

```text
specs/001-accounts-auth/
├── plan.md              # This file
├── research.md          # Phase 0 — key technical decisions
├── data-model.md        # Phase 1 — Account / Session / AuditLog
├── quickstart.md        # Phase 1 — run & validate locally
├── contracts/
│   └── auth-accounts-api.md   # Phase 1 — REST contract
└── tasks.md             # Phase 2 — created by /speckit-tasks (not here)
```

### Source Code (paths this feature adds)

```text
backend/
├── prisma/
│   └── schema.prisma                         # +Account, +Session, +AuditLog, +enums Role/AuditAction
├── prisma/seed/
│   └── bootstrap-admin.ts                     # idempotent first-admin seed (FR-020)
├── src/
│   ├── config/
│   │   └── env.ts                             # zod-validated env (DB, session TTLs, bootstrap creds, cookie)
│   ├── routes/
│   │   ├── auth.routes.ts                     # /api/auth/login|logout|session|password
│   │   └── admin-accounts.routes.ts           # /api/admin/accounts ...
│   ├── controllers/
│   │   ├── auth.controller.ts
│   │   └── admin-accounts.controller.ts
│   ├── services/
│   │   ├── auth.service.ts                    # login/logout, generic-failure, password change
│   │   ├── account.service.ts                 # create/list/enable/disable/reset, self-lockout guard
│   │   ├── session.service.ts                 # issue/validate/revoke, idle+absolute expiry
│   │   ├── password.service.ts                # argon2id hash/verify, temp-password generation
│   │   └── audit.service.ts                   # append-only account-action records
│   ├── repositories/
│   │   ├── account.repository.ts             # Prisma access for Account
│   │   ├── session.repository.ts             # Prisma access for Session
│   │   └── audit.repository.ts               # Prisma access for AuditLog
│   ├── middleware/
│   │   ├── require-auth.ts                    # resolves session cookie → account, 401 if absent/expired
│   │   ├── require-role.ts                    # ADMIN/REVIEWER gate at server boundary (FR-011)
│   │   ├── require-password-current.ts        # blocks protected use while mustChangePassword
│   │   ├── csrf.ts                            # double-submit token check on mutations
│   │   └── rate-limit.ts                      # login throttle (FR-021)
│   ├── lib/
│   │   ├── envelope.ts                        # { success, data, error, meta } helpers
│   │   ├── tokens.ts                          # opaque session token + SHA-256 hash, temp password
│   │   └── errors.ts                          # AppError + error-code constants
│   └── app.ts                                 # express app wiring (mounts routes/middleware)
└── tests/
    ├── unit/                                  # password, session lifecycle, audit, self-lockout
    ├── integration/                           # supertest over all 10 routes (+ negative/role/csrf)
    └── e2e-helpers/                           # seed helpers for Playwright

frontend/
├── src/
│   ├── routes/
│   │   ├── LoginPage.tsx                       # only public screen
│   │   ├── ForcePasswordChangePage.tsx         # mustChangePassword flow
│   │   └── admin/
│   │       ├── AccountsListPage.tsx
│   │       └── AccountCreatePage.tsx           # shows one-time temp password
│   ├── components/
│   │   ├── ProtectedRoute.tsx                  # client guard (defense-in-depth only)
│   │   └── RoleGate.tsx                        # hides admin nav from reviewers (not the control)
│   ├── api/
│   │   └── auth.ts                             # TanStack Query hooks: login/logout/session/me
│   └── lib/
│       └── csrf.ts                             # reads csrf cookie, sets X-CSRF-Token header
└── tests/                                      # Vitest + RTL for forms/guards

e2e/
└── auth.spec.ts                                # Playwright: US1–US5 critical flows
```

**Structure Decision**: web app, monorepo. Backend follows the locked layered shape
(routes → controllers → services → repositories) with zod at the boundary and Prisma at
the data layer. Auth/session/role logic lives entirely server-side; the frontend adds only
the minimal screens auth requires. The bootstrap-admin seed lives under `backend/prisma/seed`
and is invoked by an npm script, not exposed as any HTTP route.

## Complexity Tracking

No violations. No entries required.

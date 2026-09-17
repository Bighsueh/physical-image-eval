# Tasks: 帳號與登入（Accounts & Auth）

**Input**: Design documents from `/specs/001-accounts-auth/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/auth-accounts-api.md, quickstart.md

**Feature role**: **FOUNDATIONAL** — owns the shared monorepo/infra. Phase 1 (Setup) + Phase 2
(Foundational) establish the entire backend/ + frontend/ + docker-compose skeleton that
features 002/003/004 build on. Their Setup/Foundational phases only add feature-specific
scaffolding, never re-do this.

**Tests**: REQUIRED (constitution VII — TDD, coverage ≥ 80%). Per story, test tasks come
BEFORE implementation and **MUST FAIL first** (RED → GREEN → REFACTOR). Stack: Vitest +
supertest (backend), Vitest + React Testing Library (frontend), Playwright (E2E).

## Format: `[ID] [P?] [Story] Description`

- **[P]** = can run in parallel (different files, no unmet dependency).
- **[US#]** = the user story the task serves. Setup/Foundational tasks carry no story tag.
- Dev ports: frontend **5180**, backend **3100**, Postgres **5433 → 5432**.
- Envelope on every response: `{ success, data, error: { code, message }, meta? }`.

---

## Phase 1: Setup (Shared Infrastructure — monorepo skeleton, owned by 001)

**Purpose**: Stand up the empty-but-runnable monorepo: backend/, frontend/, docker, test
runners. No business logic yet.

- [X] T001 Create monorepo root structure (`backend/`, `frontend/`, `e2e/`), root `.gitignore` (ignore `**/.env`, `node_modules`, `dist`, `coverage`, `test-results`), root `README.md`, and `git init` at repo root.
- [X] T002 [P] Initialize backend Node 22 + TypeScript project: `backend/package.json`, `backend/tsconfig.json`, install Express, Prisma, @prisma/client, zod, @node-rs/argon2, express-rate-limit, cookie-parser.
- [X] T003 [P] Initialize frontend Vite + React + TS project: `frontend/package.json`, `frontend/tsconfig.json`, `frontend/vite.config.ts` (dev server port 5180, proxy `/api` → `http://localhost:3100`), install react-router-dom + @tanstack/react-query.
- [X] T004 [P] Configure Tailwind CSS in frontend: `frontend/tailwind.config.js`, `frontend/postcss.config.js`, `frontend/src/index.css` (Tailwind directives).
- [X] T005 [P] Configure ESLint + Prettier at repo root: `.eslintrc.cjs`, `.prettierrc` covering both `backend/` and `frontend/` (no language switcher; zh-TW copy lint exempt).
- [X] T006 [P] Configure backend test tooling: `backend/vitest.config.ts` (coverage provider, lines/branches gate ≥ 80%), add supertest dev dep, `test` / `test:coverage` scripts in `backend/package.json`.
- [X] T007 [P] Configure frontend test tooling: `frontend/vitest.config.ts` (jsdom env), `frontend/tests/setup.ts` (@testing-library/react + jest-dom), `test` script in `frontend/package.json`.
- [X] T008 [P] Configure Playwright: `playwright.config.ts` at repo root (baseURL `http://localhost:5180`, webServer hooks), `e2e/` folder, `e2e` npm script.
- [X] T009 [P] Author `docker-compose.yml` at repo root: `postgres` (5433→5432, volume), `backend` (3100), `frontend` (5180), and a **read-only** bind mount of the external image source dir configured by `IMAGE_SOURCE_DIR` (conventionally the gitignored repo-root `images/`) into the backend container (constitution II — read-only; auth itself never reads it, but 001 owns this mount for 002/003).
- [X] T010 [P] Container build files: `backend/Dockerfile` (Node 22, build + run), `frontend/Dockerfile` (Vite build + static serve).
- [X] T011 [P] Author `backend/.env.example` with every variable from quickstart (`DATABASE_URL`, `SESSION_ABSOLUTE_TTL`, `SESSION_IDLE_TTL`, `COOKIE_SECURE`, `COOKIE_DOMAIN`, `COOKIE_SID_NAME`, `COOKIE_CSRF_NAME`, `ARGON2_*`, `LOGIN_RATE_MAX`, `LOGIN_RATE_WINDOW`, `BOOTSTRAP_ADMIN_USERNAME`, `BOOTSTRAP_ADMIN_PASSWORD`); confirm `backend/.env` is gitignored.
- [X] T012 Initialize Prisma: `backend/prisma/schema.prisma` datasource (postgresql) + generator (prisma-client-js), wire `DATABASE_URL` (depends on T002).

**Checkpoint**: `docker compose up` brings Postgres up; backend/frontend projects compile and run empty.

---

## Phase 2: Foundational (Blocking Prerequisites — shared primitives for ALL stories)

**Purpose**: Data model + migration, env/config, shared libs (errors, envelope, tokens,
zod base), Prisma repositories, the three cross-cutting primitive services
(password / session / audit), the full middleware pipeline, the Express app wiring, and the
frontend app shell + API client. Every user story depends on this.

**⚠️ CRITICAL**: No user-story work begins until this phase is complete.

### Data model & migration (covers all entities in data-model.md)

- [X] T013 Define enums `Role` (ADMIN | REVIEWER) and `AuditAction` (CREATE_ACCOUNT | DISABLE_ACCOUNT | ENABLE_ACCOUNT | RESET_CREDENTIAL) in `backend/prisma/schema.prisma`.
- [X] T014 Define `Account` model + indexes (PK cuid; unique normalized `username`; `displayName`; `role`; `passwordHash`; `isActive` default true; `mustChangePassword` default false; `passwordUpdatedAt`; self-FK `createdByAccountId` nullable; timestamps; indexes on `role`, `isActive`) in `backend/prisma/schema.prisma`.
- [X] T015 Define `Session` model + indexes (PK cuid; unique `tokenHash`; FK `accountId`; `csrfToken`; `createdAt`; `expiresAt`; `lastSeenAt`; `revokedAt` nullable; indexes on `accountId`, `expiresAt`) in `backend/prisma/schema.prisma`.
- [X] T016 Define `AuditLog` model + indexes (PK cuid; nullable FK `actorAccountId`; FK `targetAccountId`; `action`; `createdAt`; nullable `meta` json; indexes on `targetAccountId`, `actorAccountId`, `createdAt`) in `backend/prisma/schema.prisma`.
- [X] T017 Generate first migration `npx prisma migrate dev` creating Account / Session / AuditLog + enums; regenerate Prisma client.

### Shared libs & config

- [X] T018 [P] `backend/src/config/env.ts` — zod-validated env loader (DB, TTLs, cookie names/flags, argon2 params, rate-limit, bootstrap creds), fail-fast at startup if any required secret missing.
- [X] T019 [P] `backend/src/lib/errors.ts` — `AppError` class + the shared error-code constants with zh-TW messages from the contract table (`VALIDATION_ERROR`/輸入資料有誤, `AUTH_FAILED`/帳號或密碼錯誤, `AUTH_REQUIRED`/請先登入, `FORBIDDEN_ROLE`/權限不足, `CSRF_INVALID`/請重新整理後再試, `PASSWORD_CHANGE_REQUIRED`/首次登入請先變更密碼, `ACCOUNT_NOT_FOUND`/找不到該帳號, `USERNAME_TAKEN`/帳號識別碼已存在, `SELF_OPERATION_FORBIDDEN`/無法對自己的帳號執行此操作, `LAST_ADMIN_PROTECTED`/系統需保留至少一位啟用的管理員, `RATE_LIMITED`/嘗試次數過多，請稍後再試).
- [X] T020 [P] `backend/src/lib/envelope.ts` — `ok(data, meta?)` / `fail(code, message)` / list-envelope helpers producing `{ success, data, error, meta }`.
- [X] T021 [P] `backend/src/lib/tokens.ts` — opaque session token (`crypto.randomBytes(32)` base64url), `sha256(token)` for `tokenHash`, per-session CSRF secret, and human-deliverable temp-password generator (unambiguous alphabet, ≥ 12 chars).
- [X] T022 [P] `backend/src/lib/prisma.ts` — Prisma client singleton.
- [X] T023 [P] `backend/src/lib/validation.ts` — zod base helpers: username normalize transform (trim + lower-case, D11), `Role` enum schema, cuid id schema, password-policy schema.

### Repositories (Prisma data access)

- [X] T024 [P] `backend/src/repositories/account.repository.ts` — `findByUsername(normalized)`, `create`, `list(filters)`, `findById`, `setActive`, `setPassword`, `countActiveAdmins`.
- [X] T025 [P] `backend/src/repositories/session.repository.ts` — `create`, `findByTokenHash`, `revoke(id)`, `revokeAllForAccount(accountId)`, `touchLastSeen(id)`.
- [X] T026 [P] `backend/src/repositories/audit.repository.ts` — `append(record, tx)` (append-only, accepts a transaction client).

### Primitive services (test-first — RED before GREEN)

- [X] T027 [P] Unit tests for password service in `backend/tests/unit/password.service.test.ts` — argon2id hash/verify roundtrip, fixed dummy-hash verify holds constant cost (D6). MUST FAIL first.
- [X] T028 `backend/src/services/password.service.ts` — argon2id hash/verify (params from env) + exported fixed dummy hash for unknown-user verify (makes T027 pass).
- [X] T029 [P] Unit tests for session service in `backend/tests/unit/session.service.test.ts` — issue; validity rule `revokedAt IS NULL AND now < expiresAt AND now < lastSeenAt + IDLE_TTL`; revoke; revokeAll. MUST FAIL first.
- [X] T030 `backend/src/services/session.service.ts` — issue/validate/revoke/revokeAllForAccount, idle + absolute expiry, throttled (≤ 1/min) `lastSeenAt` refresh (depends T025; makes T029 pass).
- [X] T031 [P] Unit tests for audit service in `backend/tests/unit/audit.service.test.ts` — append inside a transaction; rejects sensitive meta (no passwords/tokens/hashes). MUST FAIL first.
- [X] T032 `backend/src/services/audit.service.ts` — append-only record helper writing in the caller's transaction (depends T026; makes T031 pass).

### Middleware pipeline & app wiring

- [X] T033 [P] `backend/src/middleware/csrf.ts` — double-submit token check on mutations (header `X-CSRF-Token` == `pie_csrf` cookie), else `403 CSRF_INVALID` (D7).
- [X] T034 [P] `backend/src/middleware/rate-limit.ts` — express-rate-limit on login keyed by IP + hashed username; `429 RATE_LIMITED`, no enumeration signal (D8, FR-021).
- [X] T035 [P] `backend/src/middleware/require-role.ts` — ADMIN/REVIEWER gate at server boundary; `403 FORBIDDEN_ROLE` (FR-011).
- [X] T036 [P] `backend/src/middleware/require-password-current.ts` — block protected routes while `mustChangePassword`; `403 PASSWORD_CHANGE_REQUIRED` (allow `/api/auth/password` + `/api/auth/logout`).
- [X] T037 `backend/src/middleware/require-auth.ts` — resolve `pie_sid` → `session.service.validate` → account; `401 AUTH_REQUIRED` if absent/expired/revoked (depends T030).
- [X] T038 `backend/src/app.ts` — Express app wiring: cookie-parser, json body, mount middleware pipeline, route mounts (placeholders), central `AppError → envelope` error handler, catch-all `404` envelope handler (depends T033–T037, T019, T020).
- [X] T039 `backend/src/server.ts` — startup: validate env (T018), listen on :3100 (depends T038).

### Frontend app shell

- [X] T040 [P] `frontend/src/main.tsx` + `frontend/src/App.tsx` — React Router + TanStack Query provider + Tailwind base shell.
- [X] T041 [P] `frontend/src/lib/csrf.ts` + `frontend/src/api/client.ts` — fetch wrapper (`credentials: 'include'`, parse envelope, read `pie_csrf` cookie → `X-CSRF-Token` header on mutations).

**Checkpoint**: Foundation ready — server boots, middleware + primitives unit-green, frontend shell renders. User stories can now proceed.

---

## Phase 3: User Story 1 — 審查者登入並落在個人進度頁 (Priority: P1) 🎯 MVP

**Goal**: A reviewer logs in with admin-issued credentials and lands on their personal
progress page (0／N start). Wrong credentials return one generic failure that never reveals
whether the account exists.

**Independent Test**: Log in with a valid reviewer account → `redirect=/progress` + 0／N
landing; log in with any wrong credentials → identical `401 AUTH_FAILED / 帳號或密碼錯誤`.

### Tests (write first, MUST FAIL)

- [X] T042 [P] [US1] Integration test in `backend/tests/integration/auth-login.test.ts` — `POST /api/auth/login` valid REVIEWER → 200, sets `pie_sid` + `pie_csrf`, body `data.account` (no hash) + `data.redirect=/progress`; admin → `/admin/accounts`; `mustChangePassword` → `/password/change`.
- [X] T043 [P] [US1] Integration test in `backend/tests/integration/auth-login-parity.test.ts` — unknown username / wrong password / disabled account ALL return identical `401 { code:"AUTH_FAILED", message:"帳號或密碼錯誤" }`, no cookies (FR-004, SC-004).
- [X] T044 [P] [US1] Unit test in `backend/tests/unit/auth.service.test.ts` — `auth.service.login` runs dummy-verify on unknown user, collapses disabled account into generic failure, issues session on success.
- [X] T045 [P] [US1] Frontend test in `frontend/tests/LoginPage.test.tsx` — required fields, submit invokes login hook, shows `帳號或密碼錯誤` on 401, and asserts NO registration/signup link is present (cross-checks US3).
- [X] T046 [P] [US1] E2E in `e2e/auth.spec.ts` (US1 block) — valid reviewer login → lands `/progress` showing 0／N; wrong creds → generic message, stays on login.

### Implementation

- [X] T047 [US1] `backend/src/services/auth.service.ts` — `login(username, password)`: normalize, lookup, dummy-verify-on-miss, argon2 verify, disabled→generic-fail, issue session + CSRF (depends T024, T028, T030).
- [X] T048 [US1] `backend/src/controllers/auth.controller.ts` — login handler: set `pie_sid` (httpOnly+Secure+SameSite=Lax) + `pie_csrf` cookies, envelope with role-based `redirect`.
- [X] T049 [US1] `backend/src/routes/auth.routes.ts` — `POST /api/auth/login` (rate-limit, no auth, no CSRF); mount in `app.ts`.
- [X] T050 [P] [US1] `frontend/src/api/auth.ts` — `useLogin` TanStack Query mutation hook.
- [X] T051 [US1] `frontend/src/routes/LoginPage.tsx` — the only public screen; zh-TW labels, keyboard-operable, text (not color) error state (depends T050).
- [X] T052 [US1] `frontend/src/components/ProtectedRoute.tsx` + router config — public `/login`, role-based landing redirect (reviewer → `/progress`), client guard is defense-in-depth only.

**Checkpoint**: US1 independently demoable — reviewer login → 0／N, generic-failure parity holds.

---

## Phase 4: User Story 2 — 管理員建立／停用／重設審查者帳號 (Priority: P1)

**Goal**: Admin creates reviewer accounts (one-time temp password), disables departed
reviewers (sessions revoked, reviews preserved), and resets credentials (new temp password,
forced change, all sessions revoked). First admin comes from an idempotent bootstrap seed.

**Independent Test**: Admin creates an account → it can log in; disable it → login fails,
records preserved; reset → old sessions dead, only the new temp password works + forced change.

### Tests (write first, MUST FAIL)

- [X] T053 [P] [US2] Integration in `backend/tests/integration/admin-accounts-create.test.ts` — `POST /api/admin/accounts` → 201, `data.tempPassword` returned once, `mustChangePassword=true`, `CREATE_ACCOUNT` audit row; duplicate username → `409 USERNAME_TAKEN`; bad role → `400 VALIDATION_ERROR`.
- [X] T054 [P] [US2] Integration in `backend/tests/integration/admin-accounts-read.test.ts` — `GET /api/admin/accounts` → array + `meta:{total,count}` with `role`/`isActive`/`q` filters; `GET /:id` detail; missing → `404 ACCOUNT_NOT_FOUND`; `passwordHash` never present.
- [X] T055 [P] [US2] Integration in `backend/tests/integration/admin-accounts-disable.test.ts` — disable → `isActive=false`, ALL target sessions revoked (FR-017), reviews untouched (FR-008), `DISABLE_ACCOUNT` audit; second disable → 200 no-op (idempotent); own account → `409 SELF_OPERATION_FORBIDDEN`; last active admin → `409 LAST_ADMIN_PROTECTED`.
- [X] T056 [P] [US2] Integration in `backend/tests/integration/admin-accounts-enable.test.ts` — enable → `isActive=true`, `ENABLE_ACCOUNT` audit, no new credential; re-enable → 200 no-op (idempotent).
- [X] T057 [P] [US2] Integration in `backend/tests/integration/admin-accounts-reset.test.ts` — reset → new `tempPassword` once, `mustChangePassword=true`, ALL sessions revoked, disabled account stays disabled (no implicit enable), `RESET_CREDENTIAL` audit; own account → `409 SELF_OPERATION_FORBIDDEN`.
- [X] T058 [P] [US2] Integration in `backend/tests/integration/auth-password.test.ts` — `POST /api/auth/password` clears `mustChangePassword`, revokes caller's OTHER sessions, keeps current; wrong currentPassword → `401 AUTH_FAILED`; weak new → `400 VALIDATION_ERROR`; `PASSWORD_CHANGE_REQUIRED` blocks other routes until changed.
- [X] T059 [P] [US2] Integration in `backend/tests/integration/bootstrap-admin.test.ts` — seed creates first ADMIN (`mustChangePassword=true`, `createdByAccountId=null`) when none exists; no-op when an admin already exists (FR-020, D5).
- [X] T060 [P] [US2] Unit in `backend/tests/unit/account.service.test.ts` — invariants: self-operation forbidden, last-active-admin protected, enable/disable idempotency, reset-disabled-stays-disabled, username case-insensitive uniqueness (D10, D11).
- [X] T061 [P] [US2] Frontend in `frontend/tests/admin-accounts.test.tsx` — `AccountCreatePage` surfaces one-time tempPassword; `AccountsListPage` renders list; `ForcePasswordChangePage` submits and clears the flag.
- [X] T062 [P] [US2] E2E in `e2e/auth.spec.ts` (US2 block) — admin create → reviewer logs in (≤ 3 steps, SC-003); disable → login fails, reviews preserved; reset → old session revoked + forced change.

### Implementation

- [X] T063 [US2] `backend/src/services/account.service.ts` — `create`/`list`/`get`/`enable`/`disable`/`resetCredential` with all invariants; each mutation writes its audit row + revokes sessions inside ONE transaction (depends T024, T025, T028, T030, T032, T021).
- [X] T064 [US2] `backend/src/services/auth.service.ts` — add `changePassword(account, current, next)`: verify current, enforce policy, set hash + `passwordUpdatedAt`, clear `mustChangePassword`, revoke other sessions (extends T047).
- [X] T065 [US2] `backend/src/controllers/admin-accounts.controller.ts` — six handlers (create / list / detail / disable / enable / reset) mapping service results to envelopes + correct status codes.
- [X] T066 [US2] `backend/src/routes/admin-accounts.routes.ts` — six routes under `/api/admin/accounts` each with `require-auth` + `require-role('ADMIN')` + CSRF on mutations; mount in `app.ts`.
- [X] T067 [US2] `backend/src/controllers/auth.controller.ts` + `backend/src/routes/auth.routes.ts` — add `POST /api/auth/password` (require-auth + CSRF, allowed while `mustChangePassword`).
- [X] T068 [US2] `backend/prisma/seed/bootstrap-admin.ts` + `seed:bootstrap-admin` npm script — idempotent first-ADMIN seed reading env, no HTTP path (FR-020, D5).
- [X] T069 [P] [US2] `frontend/src/api/accounts.ts` — TanStack hooks: create / list / detail / enable / disable / reset.
- [X] T070 [P] [US2] `frontend/src/routes/admin/AccountsListPage.tsx` — list + per-row enable/disable/reset actions.
- [X] T071 [P] [US2] `frontend/src/routes/admin/AccountCreatePage.tsx` — create form; displays the one-time tempPassword for out-of-band hand-off.
- [X] T072 [P] [US2] `frontend/src/routes/ForcePasswordChangePage.tsx` — forced-change flow after create/reset.

**Checkpoint**: US1 + US2 work independently — full account lifecycle + forced password change.

---

## Phase 5: User Story 3 — 未登入者在任何介面都找不到建立帳號入口 (Priority: P1)

**Goal**: There is zero self-registration surface anywhere — no link, form, route, or
reachable create-account path. The only public action is login.

**Independent Test**: Crawl all reachable UI + probe likely registration paths → registration
entry count = 0; protected paths redirect unauthenticated users to login.

### Tests (write first, MUST FAIL)

- [X] T073 [P] [US3] Integration in `backend/tests/integration/no-registration.test.ts` — `POST /api/auth/register`, `/api/signup`, `/api/accounts`, `/api/auth/request-account` ALL → `404` envelope, never a registration form (SC-002, FR-005, FR-020).
- [X] T074 [P] [US3] Integration in `backend/tests/integration/protected-redirect.test.ts` — unauthenticated request to any protected/admin route → `401 AUTH_REQUIRED` (FR-014).
- [X] T075 [P] [US3] Frontend in `frontend/tests/no-registration.test.tsx` — router exposes no register/signup route; LoginPage has no create-account link/form; unauthenticated navigation to a protected route redirects to `/login`.
- [X] T076 [P] [US3] E2E in `e2e/auth.spec.ts` (US3 block) — automated scan of reachable UI asserts zero create-account entries; direct-visiting register paths → login or 404 (SC-002).

### Implementation

- [X] T077 [US3] Assert/lock absence of any registration route in `backend/src/app.ts` and confirm the catch-all `404` envelope handler covers probed paths (reinforces T038).
- [X] T078 [US3] `frontend/src/components/ProtectedRoute.tsx` — ensure no register route exists and unauthenticated access redirects to `/login` (extends T052).

**Checkpoint**: US1–US3 (all P1) complete — MVP login + admin lifecycle + zero registration surface.

---

## Phase 6: User Story 4 — 角色嚴格分離且伺服器端驗角色 (Priority: P2)

**Goal**: Every protected capability is authorized server-side by role. Reviewers can never
reach admin management or others' data; admins never enter the review flow and are never
counted as reviewers — regardless of what the frontend shows.

**Independent Test**: As a reviewer, every admin capability + every cross-reviewer read is
refused server-side; as an admin, the review-answer flow is unreachable and the admin is not
counted as a reviewer.

### Tests (write first, MUST FAIL)

- [X] T079 [P] [US4] Integration role-matrix in `backend/tests/integration/role-enforcement.test.ts` — REVIEWER on EVERY `/api/admin/*` route → `403 FORBIDDEN_ROLE`; reviewer cannot read another account's data; ADMIN is excluded from reviewer-only capability and never listed as a reviewer (FR-011/FR-012/FR-013, SC-001/SC-008).
- [X] T080 [P] [US4] Unit in `backend/tests/unit/require-role.test.ts` — `require-role` allows matching role, blocks mismatch with `403 FORBIDDEN_ROLE`, independent of any UI state.
- [X] T081 [P] [US4] Frontend in `frontend/tests/RoleGate.test.tsx` — admin nav hidden from reviewer; presence/absence is cosmetic only (not the control).
- [X] T082 [P] [US4] E2E in `e2e/auth.spec.ts` (US4 block) — reviewer is blocked from admin routes at the server even with no admin UI shown.

### Implementation

- [X] T083 [US4] Confirm `require-role('ADMIN')` wired on every `/api/admin/*` route in `backend/src/routes/admin-accounts.routes.ts`, and admin login lands `/admin/accounts` (not `/progress`) in `backend/src/controllers/auth.controller.ts`.
- [X] T084 [P] [US4] `frontend/src/components/RoleGate.tsx` — hides admin navigation from reviewers (defense-in-depth only).

**Checkpoint**: Server-side role separation proven for all protected capabilities.

---

## Phase 7: User Story 5 — 登入狀態可失效與持久化還原 (Priority: P2)

**Goal**: Sessions expire on idle/absolute timeout (re-login required), restore in-window on
reopen without re-entering credentials, revoke instantly on disable/reset, and end on logout.

**Independent Test**: Let a session idle past the limit → re-login required; reopen in-window
→ restored; disable/reset while logged in → instant invalidation; logout → re-login required.

### Tests (write first, MUST FAIL)

- [X] T085 [P] [US5] Integration in `backend/tests/integration/auth-session.test.ts` — `GET /api/auth/session` valid → account + refreshed `lastSeenAt` + re-emitted `pie_csrf`; idle-timeout → `401`; absolute-expiry → `401`; revoked → `401`; in-window reopen restores (FR-015/FR-016, SC-007).
- [X] T086 [P] [US5] Integration in `backend/tests/integration/auth-logout.test.ts` — `POST /api/auth/logout` sets `revokedAt` on current session, clears cookies; subsequent protected request → `401` (FR-018).
- [X] T087 [P] [US5] Integration in `backend/tests/integration/session-revocation.test.ts` — disable / reset revoke ALL of the target's active sessions instantly across multiple devices (FR-017, SC-006).
- [X] T088 [P] [US5] Unit in `backend/tests/unit/session-expiry.test.ts` — idle vs absolute boundary conditions and throttled `lastSeenAt` refresh (extends T029 coverage).
- [X] T089 [P] [US5] Frontend in `frontend/tests/session-restore.test.tsx` — App load calls `/api/auth/session` to restore auth; logout clears client state.
- [X] T090 [P] [US5] E2E in `e2e/auth.spec.ts` (US5 block) — idle expiry → re-login; in-window reopen restores; logout → re-login.

### Implementation

- [X] T091 [US5] `backend/src/controllers/auth.controller.ts` — add `session` (GET) + `logout` handlers (extends T048).
- [X] T092 [US5] `backend/src/routes/auth.routes.ts` — add `GET /api/auth/session` (require-auth) + `POST /api/auth/logout` (require-auth + CSRF) (extends T049).
- [X] T093 [US5] `backend/src/services/session.service.ts` — throttled `lastSeenAt` refresh + CSRF re-emit on `/session` (extends T030).
- [X] T094 [P] [US5] `frontend/src/api/auth.ts` + `frontend/src/App.tsx` — `useSession` restore-on-load + `useLogout` hook + logout control (extends T050).

**Checkpoint**: All five user stories independently functional.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Coverage gate, security/timing hardening, accessibility, docs, end-to-end
validation — concerns spanning all stories.

- [X] T095 [P] Verify coverage ≥ 80% on backend (`npm run test:coverage`) and frontend; close gaps in `backend/tests/` / `frontend/tests/` (constitution VII).
- [X] T096 [P] Security pass: assert no passwords / temp passwords / tokens / session ids appear in logs; secrets loaded only from env and validated at startup; argon2 params sourced from env (constitution V).
- [X] T097 Constant-time login verification in `backend/tests/integration/timing-parity.test.ts` — no observable body or timing difference across unknown / active / disabled username classes (SC-004, D6).
- [X] T098 [P] Accessibility pass on `frontend/src/routes/LoginPage.tsx`, `ForcePasswordChangePage.tsx`, and admin forms — keyboard-only operation, error state via text (not color alone), labels associated to inputs (constitution IX).
- [X] T099 [P] Optional expired-session prune housekeeping in `backend/src/jobs/prune-sessions.ts` using the `expiresAt` index.
- [X] T100 Run quickstart.md §5 curl acceptance flows (5.1–5.9) + §7 audit-trail inspection end-to-end against the running stack.
- [X] T101 [P] Run instructions: `backend/README.md` + `frontend/README.md` (ports, env, seed, tests; no secrets committed).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately. Establishes the monorepo skeleton owned by 001.
- **Foundational (Phase 2)**: depends on Setup. **BLOCKS all user stories.** Migration (T017) depends on schema tasks T013–T016; app wiring (T038) depends on the middleware + libs; `require-auth` (T037) depends on `session.service` (T030).
- **User Stories (Phases 3–7)**: all depend on Foundational. In priority order P1 (US1, US2, US3) → P2 (US4, US5). Each is independently testable once Foundational is done.
- **Polish (Phase 8)**: depends on all targeted stories being complete.

### Per-Story Dependencies

- **US1 (P1)**: depends only on Foundational. No dependency on other stories.
- **US2 (P1)**: depends on Foundational; reuses US1's `auth.service`/`auth.controller` files (extends, not blocks) — still independently testable.
- **US3 (P1)**: depends on Foundational; verifies absence of registration + reuses US1's `ProtectedRoute`. Minimal new implementation.
- **US4 (P2)**: depends on Foundational; exercises the admin routes built in US2 for its role-matrix, plus the foundational `require-role`.
- **US5 (P2)**: depends on Foundational; builds the `session`/`logout` endpoints on the foundational `session.service`; cross-checks US2's revoke-on-disable/reset.

### Within Each User Story

Order is: **tests (RED, must fail) → services → controllers → routes → frontend integration**.
Models live in Foundational (T013–T017); services depend on repositories; controllers depend
on services; routes depend on controllers; frontend pages depend on their API hooks. A story
is finished and validated before moving to the next priority.

### Parallel Opportunities

- **Setup**: T002–T011 are all `[P]` (distinct files); only T001 (creates the tree) precedes them and T012 (Prisma init) depends on T002.
- **Foundational**: schema tasks T013–T016 are sequential (same `schema.prisma`); after T017, the shared libs T018–T023 and repositories T024–T026 run in parallel. The three primitive-service test tasks (T027/T029/T031) run in parallel before their impls. Middleware T033–T036 are `[P]`; T037→T038→T039 are sequential wiring. Frontend shell T040/T041 are `[P]`.
- **Within a story**: all test tasks marked `[P]` run together first (e.g. US2: T053–T062). Frontend pages depend on their API hooks, so **T069 (`api/accounts.ts`) runs first, then the page tasks T070–T072 run in parallel** among themselves. Backend service→controller→route within one story stay sequential (shared/contiguous files).
- **Across stories**: once Foundational is done, US1–US5 can be staffed in parallel by different developers; the only soft coupling is shared `auth.*` files (US1/US2/US5) and `ProtectedRoute` (US1/US3), which should be sequenced if one developer owns them.
- **Polish**: T095, T096, T098, T099, T101 are `[P]`; T097 and T100 run against the assembled stack.

### Parallel Example — User Story 1

```bash
# Launch US1 tests together (all must FAIL first):
T042 Integration: auth-login.test.ts
T043 Integration: auth-login-parity.test.ts
T044 Unit: auth.service.test.ts
T045 Frontend: LoginPage.test.tsx
T046 E2E: auth.spec.ts (US1 block)

# Then implement: T047 (service) → T048 (controller) → T049 (route);
# in parallel on the frontend: T050 (hook) → T051 (page) → T052 (guard).
```

---

## Notes

- `[P]` = different files, no unmet dependency. `[US#]` maps a task to its story for traceability.
- All user-facing copy is zh-TW (constitution VIII); `error.code` stays machine-English.
- Every login failure returns the single generic `AUTH_FAILED / 帳號或密碼錯誤` with constant timing (FR-004, SC-004).
- The external image dir is mounted read-only and untouched by 001 (constitution II); auth owns no catalog data (constitution XI).
- Tests fail before implementation; commit after each task or logical group.

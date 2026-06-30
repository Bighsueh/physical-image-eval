# Research: 帳號與登入（Accounts & Auth）

Phase 0 technical decisions for feature 001. Stack is LOCKED
(TypeScript / Express / Prisma / PostgreSQL / session-cookie); these decisions resolve the
*how* within that stack. Each decision lists rationale and the alternatives rejected.

---

## D1 — Session storage model: server-side opaque token, hashed at rest

**Decision**: Sessions are a first-class Postgres table (`Session`) owned by this feature.
On login the server generates a 256-bit random token via `crypto.randomBytes(32)`,
base64url-encodes it, and stores **only its SHA-256 hash** (`tokenHash`, unique) in the
row. The raw token is returned solely in an httpOnly cookie (`pie_sid`). On each request,
`require-auth` hashes the cookie token, looks up the row by `tokenHash`, and validates it
is not revoked / not expired.

**Rationale**:
- Server-side sessions are LOCKED by the constitution and the technical foundation (no
  JWT-in-cookie). Storing only the hash means a DB read-only leak cannot be replayed as a
  live session (FR-017 instant invalidation needs server authority anyway).
- A single indexed lookup keeps `session/me` cheap (`< 50 ms`); revocation is a row update.
- Supports multi-device (FR-016, edge case): multiple rows per account; disable/reset
  revokes *all* active rows for the account in one `updateMany`.

**Alternatives rejected**:
- *JWT / stateless token*: cannot satisfy instant server-side invalidation on
  disable/reset (FR-017) without a denylist that re-introduces server state — strictly
  worse than owning the table.
- *`express-session` + connect-pg-simple*: hides the table we must own and audit, harder to
  enforce custom idle+absolute expiry and revocation semantics. We keep full control.
- *Store raw token in DB*: a DB leak becomes session theft; hashing removes that risk at
  negligible cost.

## D2 — Expiry: absolute lifetime + sliding idle timeout, explicit revocation

**Decision**: Each `Session` carries `expiresAt` (absolute, default 12h, env
`SESSION_ABSOLUTE_TTL`) and `lastSeenAt`; a session is valid only when
`now < expiresAt AND now < lastSeenAt + IDLE_TTL AND revokedAt IS NULL`. Idle window
default 60 min (env `SESSION_IDLE_TTL`). On a successful authed request `lastSeenAt` is
refreshed (throttled to ≤ once/min to avoid write churn). Revocation sets `revokedAt`.

**Rationale**: Satisfies FR-015 (idle/timeout expiry → re-login) and FR-016 (restore an
in-window session after reopening the tool, no re-entry of credentials, because the cookie
persists and the row is still valid). Absolute cap bounds risk even on an active session.

**Alternatives rejected**:
- *Idle-only (no absolute cap)*: an indefinitely-active session never forces re-auth — weaker.
- *Refresh `lastSeenAt` on every request*: unnecessary write amplification; throttle is enough.

## D3 — Password hashing: argon2id

**Decision**: Hash account passwords and one-time temp passwords with **argon2id**
(`@node-rs/argon2`), tuned to ≈ 100 ms/verify on deploy hardware (memory ≥ 19 MiB,
iterations/parallelism per OWASP guidance), parameters in env. Verification is always
executed on login even when the username is unknown (see D6) to hold timing constant.

**Rationale**: argon2id is the current OWASP first choice (memory-hard, GPU-resistant);
the locked foundation explicitly allows argon2id/bcrypt and we pick the stronger default.
`@node-rs/argon2` is a maintained native binding with no build-time C toolchain pain.

**Alternatives rejected**:
- *bcrypt*: acceptable fallback but 72-byte input cap and weaker memory-hardness; argon2id
  preferred when available.
- *scrypt (node crypto)*: viable but argon2id has clearer parameter guidance and is the
  recommended default.

## D4 — Credential reset → one-time temp password + forced change + session purge

**Decision**: Admin reset generates a cryptographically random, human-deliverable temp
password — a **6-digit number (0–9, e.g. `428301`)** per the 2026-06-30 clarification — returns
it **once** in the reset response body (never stored in plaintext, never logged), stores its
argon2id hash, sets
`mustChangePassword = true`, and revokes all of the target's active sessions in the same
transaction (FR-009, FR-017). First login with the temp password succeeds but
`require-password-current` blocks every protected route except `POST /api/auth/password`
until the user sets a new password; on success `mustChangePassword` clears and other
sessions are rotated.

**Rationale**: There is no email infrastructure in v1 (clarification 2026-06-30); out-of-band
hand-off of a one-time secret is the agreed flow. Forcing a change prevents a lingering
admin-known credential. Same mechanism backs account creation (initial credential).

**Alternatives rejected**:
- *Email reset link*: no mail system in v1; explicitly deferred by the spec.
- *Admin sets a chosen password directly*: admin would know the live credential
  indefinitely — violates the spirit of FR-009's forced change.

## D5 — First-admin bootstrap: idempotent deploy-time seed, never an endpoint

**Decision**: A seed script `backend/prisma/seed/bootstrap-admin.ts` (run via
`npm run seed:bootstrap-admin`) reads `BOOTSTRAP_ADMIN_USERNAME` /
`BOOTSTRAP_ADMIN_PASSWORD` from env, and **only if no ADMIN account exists** creates one
ADMIN with `mustChangePassword = true`. If any admin already exists it is a no-op. The
script is the single way the first 系統管理員 comes into being; there is no HTTP path.

**Rationale**: FR-020 + constitution III: the first admin must be pre-provisioned, never
via registration or self-service. Idempotency makes re-runs (CI, redeploy) safe.
`mustChangePassword` forces the operator off the env-seeded password on first login.

**Alternatives rejected**:
- *Bootstrap HTTP endpoint guarded by a setup token*: still a registration-shaped surface
  (violates III's "no reachable create-account path"); rejected.
- *Manual SQL insert in docs*: error-prone, unhashed-password risk; a typed seed is safer.

## D6 — Generic, constant-behavior auth failure (no account enumeration)

**Decision**: Every login failure — unknown username, wrong password, or disabled account —
returns the **same** envelope: HTTP `401`, `error.code = "AUTH_FAILED"`,
`error.message = "帳號或密碼錯誤"`, identical body and identical latency. When the username
does not exist, the service still runs an argon2id verify against a fixed dummy hash so the
timing matches the real path. Disabled accounts are checked *after* a successful password
verify and collapse into the same generic failure.

**Rationale**: FR-004 + SC-004 + constitution V — the response must not reveal whether an
account exists, is active, or which factor failed, and must not be timing-distinguishable.

**Alternatives rejected**:
- *Distinct messages ("no such user" / "account disabled")*: classic enumeration leak.
- *Short-circuit on unknown username*: leaks via response timing — rejected; dummy-verify
  closes the side channel.

## D7 — CSRF protection: double-submit token + SameSite=Lax

**Decision**: Cookie is `SameSite=Lax` (blocks cross-site form POSTs) **and** every
cookie-authenticated mutation requires a double-submit CSRF token: a non-httpOnly
`pie_csrf` cookie (random, session-bound) whose value the SPA echoes in an `X-CSRF-Token`
header; the server compares header to cookie and rejects mismatch with `403 CSRF_INVALID`.
The CSRF token is issued/refreshed by `GET /api/auth/session`.

**Rationale**: Layered defense as required by the locked foundation. SameSite=Lax alone
covers most cases; the custom-header double-submit defeats same-site and subdomain edge
cases and is trivial for a same-origin SPA. No server-side per-request CSRF state needed.

**Alternatives rejected**:
- *SameSite=Strict only*: would break legitimate top-level navigations / cross-tab restore
  and still lacks a header check; Lax + double-submit is the better balance.
- *Synchronizer token in DB*: extra state for no added safety over double-submit here.

## D8 — Rate limiting & lockout on auth

**Decision**: `express-rate-limit` on `POST /api/auth/login`, keyed by client IP **and**
submitted username (hashed key), e.g. a sliding window (default 10 attempts / 15 min) with
exponential backoff; exceeding it returns `429 RATE_LIMITED` with the same generic copy and
**no** signal about whether the username exists. Counters live in process memory for dev and
a shared store (e.g. Postgres-backed or Redis) for multi-instance prod (config-selected).

**Rationale**: FR-021 — brute-force protection whose responses still must not enable
enumeration. Keying on username+IP limits targeted guessing without locking a whole IP for
the team.

**Alternatives rejected**:
- *Hard account lockout*: enables denial-of-service against a known reviewer and risks
  admin self-lockout; throttle + backoff preferred for a small trusted team.

## D9 — Audit log shape: append-only, non-sensitive

**Decision**: `AuditLog` is append-only with `{ id, actorAccountId, targetAccountId,
action (enum: CREATE_ACCOUNT | DISABLE_ACCOUNT | ENABLE_ACCOUNT | RESET_CREDENTIAL),
createdAt, meta(jsonb, optional non-sensitive) }`. Written inside the same transaction as
the account mutation (audit and effect commit together or not at all). Never stores
passwords, temp passwords, hashes, or session tokens.

**Rationale**: FR-023 requires recording actor, target, action, and time for
create/disable/reset. Same-transaction write guarantees the trail matches reality;
append-only honors immutability (constitution VI) and avoids tampering.

**Alternatives rejected**:
- *Log lines only*: not queryable, not durable as a record, easy to lose — insufficient for
  an audit requirement.

## D10 — Self-lockout / idempotency guards (service-layer invariants)

**Decision**: `account.service` enforces application invariants beyond the schema: (a) an
admin cannot disable or reset **their own** account (`409 SELF_OPERATION_FORBIDDEN`),
guarding against self-lockout (edge case); (b) the system refuses to disable the **last
active admin** (governance continuity); (c) enable/disable are **idempotent** — disabling an
already-disabled account (or enabling an active one) returns success with no state change
and no error (FR-010, edge case); (d) resetting a disabled account's credential keeps it
disabled (does not silently re-enable — edge case).

**Rationale**: These are correctness/safety rules the spec edge-cases call out; they belong
in the service layer because they are cross-row policy, not single-field validation.

**Alternatives rejected**:
- *Enforce only via DB constraints*: cannot express "last active admin" or "not self"
  cleanly; service-layer checks are the right boundary.

## D11 — Username uniqueness & case-insensitivity

**Decision**: `Account.username` is unique case-insensitively. Implemented by storing a
normalized `username` (trimmed, lower-cased at the boundary via zod transform) with a unique
index; the original display casing lives in `displayName`. Create conflict →
`409 USERNAME_TAKEN` with zh-TW message `帳號識別碼已存在`.

**Rationale**: FR-019 (unique identifier, clear conflict message) and the "duplicate
identifier" edge case. Case-insensitive uniqueness prevents `Dr.Lin` vs `dr.lin`
collisions confusing reviewers.

**Alternatives rejected**:
- *Postgres `citext`*: works, but a normalized column + plain unique index is portable and
  explicit, and keeps Prisma typing simple.

---

## Cross-feature notes

- `Account` (this feature) is referenced by **Review** (003, `reviewer × blueprint`) and by
  the admin **dashboard/export** (004). 001 does not define those; it only guarantees a
  stable `Account.id` + `role` + `isActive` for them to consume.
- The "非在職（disabled reviewer）" export-retention rule (FR-022) is *honored* here only by
  never deleting/anonymizing a disabled account or its sessions/links; the actual export
  labelling and ratio exclusion live in 004.

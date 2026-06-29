# Data Model: 帳號與登入（Accounts & Auth）

Logical model for the entities **owned by feature 001**: `Account`, `Session`, `AuditLog`,
plus the enums `Role` and `AuditAction`. Types are given at a logical level; the physical
mapping is Prisma → PostgreSQL. Cross-feature entities (Review, PanelReview — feature 003)
are referenced, **not redefined**.

This feature is part of the **mutable / review domain** (constitution XI). It never creates
or edits catalog-domain data (Region/Blueprint/Panel/Diagnosis, owned by 002).

---

## Enums

### Role
The two and only two roles (FR-001). Strictly separated, server-enforced (FR-011).

| Value | zh-TW label | Meaning |
|-------|-------------|---------|
| `ADMIN` | 系統管理員 | Account CRUD + dashboard/export (004); never reviews images. |
| `REVIEWER` | 審查者 | Reviews images, sees only own records (003). |

### AuditAction
Governance operations recorded in the audit trail (FR-023).

| Value | zh-TW label |
|-------|-------------|
| `CREATE_ACCOUNT` | 建立帳號 |
| `DISABLE_ACCOUNT` | 停用帳號 |
| `ENABLE_ACCOUNT` | 啟用帳號 |
| `RESET_CREDENTIAL` | 重設憑證 |

---

## Entity: Account（帳號）

Represents a person who can enter the system. Each account has exactly one `Role`.

| Field | Type (logical) | Notes / constraints |
|-------|----------------|---------------------|
| `id` | string (cuid) | PK. Stable id consumed by Review (003) & dashboard (004). |
| `username` | string | **Unique, case-insensitive** (normalized: trimmed + lower-cased). 帳號識別碼 (FR-019, D11). |
| `displayName` | string | 顯示名稱 (FR-006). Free text → sanitized on output. Non-empty. |
| `role` | `Role` | `ADMIN` \| `REVIEWER` (FR-001). Immutable after creation in v1. |
| `passwordHash` | string | argon2id hash (D3). Never returned by any API, never logged. |
| `isActive` | boolean | default `true`. `false` = 停用 / 非在職. Disabled ⇒ all logins fail (FR-007). |
| `mustChangePassword` | boolean | default `false`. `true` after create or reset; forces change on first login (FR-009, D4). |
| `passwordUpdatedAt` | timestamptz | Set on create, reset, and self password change. |
| `createdByAccountId` | string \| null | FK → Account.id (self). The admin who created this account; `null` for the bootstrap admin (FR-020). |
| `createdAt` | timestamptz | default now(). |
| `updatedAt` | timestamptz | auto-updated. |

**Relationships**
- `Account 1 ──< Session` (one account, many sessions / devices).
- `Account 1 ──< AuditLog` as **actor** (operations it performed).
- `Account 1 ──< AuditLog` as **target** (operations performed on it).
- `Account 0..1 ──< Account` self-reference via `createdByAccountId`.
- *(cross-feature, not defined here)* `Account(REVIEWER) 1 ──< Review 0..51` (003) — a
  reviewer account maps to 0..51 Reviews. Disabling an account must never delete/anonymize
  these (FR-008, FR-022).

**Indexes / uniqueness**
- Unique index on normalized `username`.
- Index on `role` (filter reviewers vs admins for list / dashboard).
- Index on `isActive` (active-admin / active-reviewer queries).

**Application-level invariants** (service layer, D10)
- At least one **active ADMIN** must remain: disabling/locking the last active admin is
  refused (governance continuity).
- An admin cannot disable or reset **their own** account (`SELF_OPERATION_FORBIDDEN`) — anti
  self-lockout.
- Enable/disable are **idempotent** (FR-010): no-op + success when already in target state.
- Resetting a **disabled** account's credential keeps `isActive = false` (no implicit enable).
- Role `ADMIN` accounts are never counted as reviewers by any stat/export (FR-013; enforced
  where consumed, 004).

---

## Entity: Session（登入狀態）

One currently-or-formerly valid login of an account. Server-side; the cookie carries only an
opaque token whose **hash** is stored here (D1).

| Field | Type (logical) | Notes / constraints |
|-------|----------------|---------------------|
| `id` | string (cuid) | PK (internal row id). |
| `tokenHash` | string | **Unique.** SHA-256 of the opaque cookie token. The raw token is never stored. |
| `accountId` | string | FK → Account.id. `ON DELETE CASCADE` not used — accounts are disabled, not deleted; sessions are revoked. |
| `csrfToken` | string | Per-session double-submit CSRF secret (D7), mirrored to the `pie_csrf` cookie. |
| `createdAt` | timestamptz | default now(). |
| `expiresAt` | timestamptz | Absolute expiry = createdAt + `SESSION_ABSOLUTE_TTL` (D2). |
| `lastSeenAt` | timestamptz | Sliding idle marker; refreshed (≤ 1/min) on authed requests. |
| `revokedAt` | timestamptz \| null | Set on logout, account disable, or credential reset (FR-017). |

**Validity rule (derived, not a stored column)**
A session is *valid* iff: `revokedAt IS NULL` AND `now < expiresAt` AND
`now < lastSeenAt + SESSION_IDLE_TTL`.

**Relationships**
- `Session *──1 Account`.

**Indexes / uniqueness**
- Unique index on `tokenHash` (the lookup key on every request).
- Index on `accountId` (bulk-revoke on disable/reset: `updateMany` where
  `accountId = ? AND revokedAt IS NULL`).
- Index on `expiresAt` (housekeeping sweep of expired rows; optional cron prune).

**Lifecycle / invalidation (FR-015..FR-018)**
- **Logout** (FR-018): set `revokedAt` on the current session only.
- **Idle / absolute timeout** (FR-015): not revoked in DB necessarily; treated invalid by the
  derived rule; pruned later.
- **Restore in-window** (FR-016): a valid row + persisted cookie ⇒ login restored, no re-entry.
- **Disable / reset** (FR-017): `updateMany` sets `revokedAt = now()` for **all** active
  sessions of the target account (multi-device, edge case) in the same transaction as the
  account change.

---

## Entity: AuditLog（帳號操作軌跡）

Append-only record of an admin governance action on an account (FR-023). Never updated or
deleted in v1.

| Field | Type (logical) | Notes / constraints |
|-------|----------------|---------------------|
| `id` | string (cuid) | PK. |
| `actorAccountId` | string \| null | FK → Account.id — who performed it. `null` only for the bootstrap seed (system actor). |
| `targetAccountId` | string | FK → Account.id — the account acted upon. |
| `action` | `AuditAction` | `CREATE_ACCOUNT` \| `DISABLE_ACCOUNT` \| `ENABLE_ACCOUNT` \| `RESET_CREDENTIAL`. |
| `createdAt` | timestamptz | default now(). The operation time. |
| `meta` | json \| null | Optional **non-sensitive** context (e.g. `{ role: "REVIEWER" }`). **Never** passwords, temp passwords, hashes, or tokens. |

**Relationships**
- `AuditLog *──1 Account` (actor, nullable).
- `AuditLog *──1 Account` (target).

**Indexes**
- Index on `targetAccountId` (history of one account).
- Index on `actorAccountId` (actions by one admin).
- Index on `createdAt` (chronological / range queries for review).

**Write rule**
- Written **inside the same transaction** as the account mutation it records (D9) — the
  effect and its audit row commit atomically or roll back together.

---

## Relationship summary (ERD, logical)

```text
Account 1 ───────< Session            (account has many sessions; revoke-all on disable/reset)
Account 1 ───────< AuditLog (actor)   (admin's performed actions; actor nullable = bootstrap)
Account 1 ───────< AuditLog (target)  (actions taken on this account)
Account 0..1 ────< Account            (createdByAccountId self-ref; null for first admin)

# cross-feature (defined elsewhere, referenced only)
Account(REVIEWER) 1 ──< Review 0..51  (feature 003 — never deleted on disable; FR-008/FR-022)
```

## Notes on cross-feature references

- **Review / PanelReview (003)**: owned by 003. 001 guarantees a durable `Account.id`,
  `role`, and `isActive`; it must not cascade-delete reviews when an account is disabled
  (FR-008). The "非在職" export label and ratio exclusion (FR-022) are realized in 004 using
  `Account.isActive`.
- **Catalog domain (002)**: no relationship — auth never touches Region/Blueprint/Panel/
  Diagnosis (constitution XI).

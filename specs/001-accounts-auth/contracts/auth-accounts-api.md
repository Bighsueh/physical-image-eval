# API Contract: Auth & Accounts（帳號與登入）

REST contract for feature 001. All endpoints live under `/api`. JSON in / JSON out. Every
response uses the project envelope; cookie-based auth + CSRF as defined in
[research.md](../research.md). No implementation code here — this is the wire contract.

## Conventions

### Response envelope

```jsonc
// success
{ "success": true,  "data": { /* T */ }, "error": null, "meta": { /* optional */ } }
// failure
{ "success": false, "data": null, "error": { "code": "STRING_CODE", "message": "zh-TW 訊息" } }
```

- `error.code` is a stable machine string (English). `error.message` is the user-facing
  繁體中文 copy (constitution VIII).
- `meta` is present only on list endpoints (`{ total, count }`).

### Auth & CSRF

- On login the server sets two cookies:
  - `pie_sid` — opaque session token. `HttpOnly; Secure; SameSite=Lax; Path=/`
    (`Domain=your-domain.example.com` in prod). No JS access.
  - `pie_csrf` — CSRF token. `Secure; SameSite=Lax; Path=/` (readable by the SPA).
- Every **mutating** request (POST) that relies on the session cookie MUST send header
  `X-CSRF-Token` equal to the `pie_csrf` cookie value. Mismatch ⇒ `403 CSRF_INVALID`.
- `require-auth` resolves `pie_sid` → active session → account. Missing/expired/revoked ⇒
  `401 AUTH_REQUIRED`.
- `require-role('ADMIN')` gates every `/api/admin/*` route at the server boundary
  (FR-011). UI hiding is never the only control.
- While `account.mustChangePassword = true`, all protected routes except
  `POST /api/auth/password` and `POST /api/auth/logout` return `403 PASSWORD_CHANGE_REQUIRED`.

### Shared error codes

| HTTP | `error.code` | zh-TW `message` | When |
|------|--------------|-----------------|------|
| 400 | `VALIDATION_ERROR` | 輸入資料有誤 | zod boundary validation failed |
| 401 | `AUTH_FAILED` | 帳號或密碼錯誤 | **any** login failure (unknown / wrong pw / disabled) — identical for all (FR-004, SC-004) |
| 401 | `AUTH_REQUIRED` | 請先登入 | no/expired/revoked session on a protected route |
| 403 | `FORBIDDEN_ROLE` | 權限不足 | authenticated but wrong role (e.g. reviewer hitting admin route) |
| 403 | `CSRF_INVALID` | 請重新整理後再試 | missing/mismatched CSRF token on a mutation |
| 403 | `PASSWORD_CHANGE_REQUIRED` | 首次登入請先變更密碼 | `mustChangePassword` blocks the route |
| 404 | `ACCOUNT_NOT_FOUND` | 找不到該帳號 | admin targets a non-existent account id |
| 409 | `USERNAME_TAKEN` | 帳號識別碼已存在 | create with a duplicate username (FR-019) |
| 409 | `SELF_OPERATION_FORBIDDEN` | 無法對自己的帳號執行此操作 | admin disables/resets own account (D10) |
| 409 | `LAST_ADMIN_PROTECTED` | 系統需保留至少一位啟用的管理員 | disabling the last active admin (D10) |
| 429 | `RATE_LIMITED` | 嘗試次數過多，請稍後再試 | login rate limit exceeded (FR-021) — no enumeration signal |

---

## Auth endpoints

### POST `/api/auth/login`
Log in and start a session. **No auth required. Rate limited (FR-021). CSRF not required**
(no pre-existing session). Generic failure for every error (FR-004, D6).

- Role required: none.
- Request:
  ```json
  { "username": "dr.lin", "password": "•••••••" }
  ```
  (`username` trimmed + lower-cased server-side; both fields required, zod-validated.)
- 200 — success. Sets `pie_sid` + `pie_csrf` cookies.
  ```json
  {
    "success": true,
    "data": {
      "account": {
        "id": "ckv...",
        "username": "dr.lin",
        "displayName": "林醫師",
        "role": "REVIEWER",
        "mustChangePassword": false
      },
      "redirect": "/progress"
    },
    "error": null
  }
  ```
  - For a REVIEWER, `redirect` points at the personal-progress page (003) — the 0／51
    landing (FR-002, FR-003). For an ADMIN, `redirect` is `/admin/accounts`.
  - When `mustChangePassword = true`, `redirect` is `/password/change` (FR-009).
- 401 `AUTH_FAILED` — unknown username **or** wrong password **or** disabled account.
  Identical body & timing for all three (SC-004). No cookies set.
- 429 `RATE_LIMITED` — too many attempts; same generic copy, no account-existence signal.

### POST `/api/auth/logout`
End the current session (FR-018).

- Role required: any authenticated. CSRF required.
- Request: empty body.
- 200 — current session `revokedAt` set; `pie_sid` / `pie_csrf` cleared.
  ```json
  { "success": true, "data": { "loggedOut": true }, "error": null }
  ```
- 401 `AUTH_REQUIRED` — no active session (treated as already logged out is acceptable;
  contract returns 200 idempotently if a session cookie resolves, else 401).

### GET `/api/auth/session`
Return the current account (restore-on-reopen, FR-016) and refresh the CSRF token.

- Role required: any authenticated.
- 200 — valid session.
  ```json
  {
    "success": true,
    "data": {
      "account": {
        "id": "ckv...",
        "username": "dr.lin",
        "displayName": "林醫師",
        "role": "REVIEWER",
        "mustChangePassword": false
      }
    },
    "error": null
  }
  ```
  (Also refreshes `lastSeenAt` and re-emits `pie_csrf`.)
- 401 `AUTH_REQUIRED` — no/expired/idle-timed-out/revoked session (FR-015, FR-017).

### POST `/api/auth/password`
Change the **caller's own** password. Used for the forced change after create/reset
(FR-009) and for voluntary change.

- Role required: any authenticated. CSRF required. Allowed even while
  `mustChangePassword = true`.
- Request:
  ```json
  { "currentPassword": "•••••••", "newPassword": "••••••••••" }
  ```
  (`newPassword` validated against a minimum strength policy; `currentPassword` re-verified.)
- 200 — password updated; `mustChangePassword` cleared; the caller's **other** sessions are
  revoked (current session kept).
  ```json
  { "success": true, "data": { "passwordChanged": true }, "error": null }
  ```
- 400 `VALIDATION_ERROR` — new password fails policy.
- 401 `AUTH_FAILED` — `currentPassword` does not match (generic copy).
- 401 `AUTH_REQUIRED` — no session.

---

## Admin account endpoints (role `ADMIN`, server-enforced)

All under `/api/admin/accounts`. Every route requires `require-auth` + `require-role('ADMIN')`.
Mutations require CSRF. A reviewer hitting any of these gets `403 FORBIDDEN_ROLE` (FR-011,
FR-012, SC-001).

### POST `/api/admin/accounts`
Create an account and return a one-time initial credential (FR-006; FR-020 for admin role).

- Request:
  ```json
  { "displayName": "陳醫師", "username": "dr.chen", "role": "REVIEWER" }
  ```
  - `role` defaults to `REVIEWER`; `ADMIN` allowed **only** when the caller is an admin
    (always true here) — first admin is never created via this route (FR-020).
- 201 — created (active, `mustChangePassword = true`). Writes a `CREATE_ACCOUNT` audit row.
  ```json
  {
    "success": true,
    "data": {
      "account": {
        "id": "ckv...", "username": "dr.chen", "displayName": "陳醫師",
        "role": "REVIEWER", "isActive": true, "mustChangePassword": true,
        "createdAt": "2026-06-30T03:00:00Z"
      },
      "tempPassword": "Hx7-K2pm-Q9rt"
    },
    "error": null
  }
  ```
  - `tempPassword` is shown **once**, never returned again, never stored in plaintext,
    never logged (D4). The frontend displays it for out-of-band hand-off.
- 400 `VALIDATION_ERROR` — bad fields / role not in enum.
- 409 `USERNAME_TAKEN` — duplicate username (FR-019).

### GET `/api/admin/accounts`
List accounts (FR-006 management view; never exposes hashes).

- Query (optional): `role`, `isActive`, `q` (display/username search).
- 200 — array + `meta`.
  ```json
  {
    "success": true,
    "data": [
      { "id": "ckv...", "username": "dr.lin", "displayName": "林醫師",
        "role": "REVIEWER", "isActive": true, "mustChangePassword": false,
        "createdAt": "2026-06-30T01:00:00Z" }
    ],
    "error": null,
    "meta": { "total": 1, "count": 1 }
  }
  ```

### GET `/api/admin/accounts/:id`
Account detail (no password hash, no tokens).

- 200 — single account object (same shape as list item; may include recent audit summary).
- 404 `ACCOUNT_NOT_FOUND`.

### POST `/api/admin/accounts/:id/disable`
Disable an account (FR-007, FR-008). Idempotent (FR-010, D10).

- 200 — `isActive` set `false`; **all** active sessions of the target revoked (FR-017);
  reviews preserved (FR-008). Writes a `DISABLE_ACCOUNT` audit row. Returns the updated
  account. Disabling an already-disabled account ⇒ 200 no-op.
- 404 `ACCOUNT_NOT_FOUND`.
- 409 `SELF_OPERATION_FORBIDDEN` — admin disabling own account (D10).
- 409 `LAST_ADMIN_PROTECTED` — would remove the last active admin (D10).

### POST `/api/admin/accounts/:id/enable`
Re-enable a disabled account (FR-010). Idempotent.

- 200 — `isActive` set `true`. Writes an `ENABLE_ACCOUNT` audit row. Enabling an already-
  active account ⇒ 200 no-op. (Does **not** issue any new credential.)
- 404 `ACCOUNT_NOT_FOUND`.

### POST `/api/admin/accounts/:id/reset-credential`
Reset credentials → one-time temp password, force change, purge sessions (FR-009, FR-017).

- 200 — generates a new temp password (returned once), stores its hash, sets
  `mustChangePassword = true`, revokes **all** active sessions of the target (FR-017).
  Keeps `isActive` unchanged (resetting a disabled account stays disabled — D10/edge case).
  Writes a `RESET_CREDENTIAL` audit row.
  ```json
  {
    "success": true,
    "data": {
      "account": { "id": "ckv...", "username": "dr.lin", "isActive": true,
                   "mustChangePassword": true },
      "tempPassword": "Tg4-9bWn-Lz2c"
    },
    "error": null
  }
  ```
- 404 `ACCOUNT_NOT_FOUND`.
- 409 `SELF_OPERATION_FORBIDDEN` — admin resetting own account (D10).

---

## Non-HTTP interface: first-admin bootstrap (seed)

Not an endpoint — a deploy-time command (FR-020, D5). There is **no** registration or
self-service create-account HTTP path anywhere (constitution III, SC-002).

```bash
# backend/, run once at deploy (idempotent)
npm run seed:bootstrap-admin
```

- Reads env `BOOTSTRAP_ADMIN_USERNAME`, `BOOTSTRAP_ADMIN_PASSWORD` (validated present at
  startup; never logged).
- **If no ADMIN account exists**, creates one `ADMIN` (`isActive = true`,
  `mustChangePassword = true`, `createdByAccountId = null`). Otherwise a no-op.
- Re-runnable safely (CI / redeploy). Source image dir untouched (constitution II — N/A
  here, but no filesystem writes occur).

## Explicitly absent endpoints (by design)

There is **no** `POST /api/auth/register`, `/api/signup`, `/api/accounts` (public),
`/api/auth/request-account`, or any reachable create-account path for unauthenticated users.
Hitting such a path returns `404` (no such route) — never a registration form (US3, SC-002).

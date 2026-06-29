# Quickstart: 帳號與登入（Accounts & Auth）

How to run and validate feature 001 end-to-end on localhost. Dev ports (constitution X):
**frontend 5180**, **backend 3100**, **Postgres 5433 → 5432**.

> Verify ports are free first: `lsof -nP -iTCP -sTCP:LISTEN | grep -E '5180|3100|5433'`
> (avoid the host-occupied 5000 / 7000 / 5432 / 32222).

## 1. Environment variables

Create `backend/.env` (all secrets via env, validated present at startup — constitution V;
never commit real values):

```bash
# --- database ---
DATABASE_URL="postgresql://pie:pie@localhost:5433/physical_image_eval?schema=public"

# --- session / cookie ---
SESSION_ABSOLUTE_TTL="12h"        # absolute session lifetime (D2)
SESSION_IDLE_TTL="60m"            # idle timeout (D2)
COOKIE_SECURE="false"             # false on http localhost; true in prod
COOKIE_DOMAIN=""                  # empty on localhost; your-domain.example.com in prod
COOKIE_SID_NAME="pie_sid"
COOKIE_CSRF_NAME="pie_csrf"

# --- password hashing (argon2id, D3) ---
ARGON2_MEMORY_KIB="19456"
ARGON2_ITERATIONS="2"
ARGON2_PARALLELISM="1"

# --- login rate limit (FR-021, D8) ---
LOGIN_RATE_MAX="10"
LOGIN_RATE_WINDOW="15m"

# --- first-admin bootstrap (FR-020, D5) — change before any real deploy ---
BOOTSTRAP_ADMIN_USERNAME="admin"
BOOTSTRAP_ADMIN_PASSWORD="change-me-on-first-login"
```

Prod (`your-domain.example.com` via Cloudflared): set `COOKIE_SECURE=true`,
`COOKIE_DOMAIN=your-domain.example.com`, and supply strong bootstrap creds.

## 2. Bring up the stack

```bash
# from repo root — postgres + backend + frontend
docker compose up -d postgres
docker compose up -d backend frontend
# or run backend/frontend on host for dev:
#   (backend/)  npm install && npm run dev      # serves :3100
#   (frontend/) npm install && npm run dev      # serves :5180
```

## 3. Migrate + bootstrap the first admin

```bash
# backend/
npx prisma migrate dev          # creates Account / Session / AuditLog + enums
npm run seed:bootstrap-admin     # idempotent first ADMIN (no-op if an admin exists)
```

Re-running `seed:bootstrap-admin` is safe (no-op when an admin already exists — D5).

## 4. Run the tests (TDD, ≥ 80% — constitution VII)

```bash
# backend/
npm run test            # Vitest unit + supertest integration
npm run test:coverage   # gate: lines/branches ≥ 80%

# frontend/
npm run test            # Vitest + React Testing Library (forms, guards)

# repo root
npx playwright test e2e/auth.spec.ts   # E2E for US1–US5
```

## 5. Manual acceptance checks (curl)

Use a cookie jar so the session + CSRF cookies persist across calls.

```bash
BASE=http://localhost:3100
JAR=/tmp/pie.cookies

# 5.1  Admin logs in (FR-002). Saves pie_sid + pie_csrf into the jar.
curl -s -c $JAR -X POST $BASE/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"change-me-on-first-login"}' | jq
# expect: success=true, data.account.role="ADMIN", data.account.mustChangePassword=true,
#         data.redirect="/password/change"

# 5.2  Forced password change for the bootstrap admin (FR-009).
CSRF=$(grep pie_csrf $JAR | awk '{print $7}')
curl -s -b $JAR -c $JAR -X POST $BASE/api/auth/password \
  -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" \
  -d '{"currentPassword":"change-me-on-first-login","newPassword":"S0me-Strong-Pass!"}' | jq
# expect: success=true, data.passwordChanged=true

# 5.3  Admin creates a reviewer (FR-006). Returns a ONE-TIME temp password.
CSRF=$(grep pie_csrf $JAR | awk '{print $7}')
curl -s -b $JAR -c $JAR -X POST $BASE/api/admin/accounts \
  -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" \
  -d '{"displayName":"林醫師","username":"dr.lin","role":"REVIEWER"}' | jq
# expect: 201, data.account.role="REVIEWER", data.account.mustChangePassword=true,
#         data.tempPassword present (record it)

# 5.4  Generic-failure parity — three inputs, ONE message (FR-004 / SC-004).
for U in does-not-exist dr.lin admin; do
  curl -s -o /dev/null -w "%{http_code} " -X POST $BASE/api/auth/login \
    -H 'Content-Type: application/json' -d "{\"username\":\"$U\",\"password\":\"wrong\"}"
  curl -s -X POST $BASE/api/auth/login -H 'Content-Type: application/json' \
    -d "{\"username\":\"$U\",\"password\":\"wrong\"}" | jq -c '.error'
done
# expect: every line → 401 {"code":"AUTH_FAILED","message":"帳號或密碼錯誤"} (identical)

# 5.5  Reviewer logs in with temp password (use a fresh jar).
RJAR=/tmp/pie.reviewer.cookies
curl -s -c $RJAR -X POST $BASE/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"dr.lin","password":"<tempPassword from 5.3>"}' | jq
# expect: success, mustChangePassword=true, redirect="/password/change"

# 5.6  Reviewer is BLOCKED from admin routes server-side (FR-011 / SC-001 / SC-008).
RCSRF=$(grep pie_csrf $RJAR | awk '{print $7}')
curl -s -b $RJAR -o /dev/null -w "%{http_code}\n" $BASE/api/admin/accounts
# expect: 403 (FORBIDDEN_ROLE) — even though no admin UI is shown

# 5.7  Disable the reviewer (FR-007) and confirm login now fails (SC-005).
RID="<reviewer id from 5.3>"
CSRF=$(grep pie_csrf $JAR | awk '{print $7}')
curl -s -b $JAR -X POST $BASE/api/admin/accounts/$RID/disable \
  -H "X-CSRF-Token: $CSRF" | jq
curl -s -o /dev/null -w "%{http_code}\n" -X POST $BASE/api/auth/login \
  -H 'Content-Type: application/json' -d '{"username":"dr.lin","password":"S0me-Strong-Pass!"}'
# expect: disable → success; subsequent login → 401 AUTH_FAILED

# 5.8  Reset credential revokes existing sessions instantly (FR-017 / SC-006).
curl -s -b $JAR -X POST $BASE/api/admin/accounts/$RID/enable -H "X-CSRF-Token: $CSRF" | jq
curl -s -b $JAR -X POST $BASE/api/admin/accounts/$RID/reset-credential -H "X-CSRF-Token: $CSRF" | jq
# expect: enable success; reset returns a NEW one-time tempPassword; any old reviewer
#         session (RJAR) is now revoked → GET /api/auth/session with RJAR returns 401
curl -s -b $RJAR -o /dev/null -w "%{http_code}\n" $BASE/api/auth/session
# expect: 401 AUTH_REQUIRED

# 5.9  No registration surface (SC-002).
for P in /api/auth/register /api/signup /api/accounts /api/auth/request-account; do
  curl -s -o /dev/null -w "$P -> %{http_code}\n" -X POST $BASE$P
done
# expect: every path -> 404 (no such route; never a registration form)
```

## 6. Acceptance-criteria mapping

| Check | Validates |
|-------|-----------|
| 5.1 + frontend landing on `/progress` showing 0／51 | FR-002, FR-003, US1 |
| 5.4 (identical 401 body across 3 username classes) | FR-004, SC-004, US1 |
| 5.3 (3-step admin create → loginable reviewer) | FR-006, SC-003, US2 |
| 5.6 (server-side 403 for reviewer on admin route) | FR-011, FR-012, SC-001, SC-008, US4 |
| 5.7 (disable → login fails; reviews preserved) | FR-007, FR-008, SC-005, US2 |
| 5.8 (reset → old sessions revoked, new temp pw, force change) | FR-009, FR-017, SC-006, US5 |
| 5.9 (no registration routes) | FR-005, FR-020, SC-002, US3 |
| Idle/absolute expiry → re-login; in-window reopen restores | FR-015, FR-016, SC-007, US5 |
| `AuditLog` rows for create/disable/enable/reset | FR-023 |

## 7. Inspecting the audit trail

```bash
docker compose exec postgres psql -U pie -d physical_image_eval \
  -c 'SELECT action, "actorAccountId", "targetAccountId", "createdAt" FROM "AuditLog" ORDER BY "createdAt";'
# expect: CREATE_ACCOUNT, DISABLE_ACCOUNT, ENABLE_ACCOUNT, RESET_CREDENTIAL rows (FR-023)
```

## 8. Teardown

```bash
docker compose down            # keep volumes
docker compose down -v         # also drop the Postgres volume (fresh DB next run)
```

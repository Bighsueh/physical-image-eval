# backend — physical-image-eval

Express + Prisma + PostgreSQL, layered **routes → controllers → services → repositories** with
zod at the boundary. Owns feature 001 auth tables (`Account`, `Session`, `AuditLog`). Runs on
**:3100** (constitution X). No secrets in the repo — all via env, validated at startup.

## Setup

```bash
# from repo root
npm install
docker compose up -d postgres          # Postgres on host :5433 → container 5432
cp backend/.env.example backend/.env    # fill local values (never commit real secrets)

# backend/
npm run prisma:migrate                  # create Account / Session / AuditLog
npm run seed:bootstrap-admin            # idempotent first admin (FR-020); change creds before prod
npm run dev                             # tsx watch → http://localhost:3100
```

## Environment (see `.env.example`)

`DATABASE_URL`, `SESSION_ABSOLUTE_TTL`, `SESSION_IDLE_TTL`, `COOKIE_SECURE`, `COOKIE_DOMAIN`,
`COOKIE_SID_NAME`, `COOKIE_CSRF_NAME`, `ARGON2_MEMORY_KIB`, `ARGON2_ITERATIONS`,
`ARGON2_PARALLELISM`, `LOGIN_RATE_MAX`, `LOGIN_RATE_WINDOW`, `BOOTSTRAP_ADMIN_USERNAME`,
`BOOTSTRAP_ADMIN_PASSWORD`. Missing/invalid values fail fast at startup (constitution V).

## Tests (TDD, coverage ≥ 80% — constitution VII)

```bash
npm run test            # Vitest unit + supertest integration (needs Postgres on :5433)
npm run test:coverage   # enforces lines/branches/functions/statements ≥ 80%
```

Tests run against a dedicated `physical_image_eval_test` database (auto-created + migrated by the
Vitest global setup); each test truncates the auth tables for isolation.

## Catalog ingestion (feature 002)

The catalog (Region / Blueprint / Panel / Diagnosis) is **read-only reference data** produced
solely by the ingestion CLI from the mounted source dir (`IMAGE_SOURCE_DIR`). It never modifies
the source (constitution II).

```bash
npm run ingest            # parse → validate → (if clean) snapshot-replace in ONE transaction
npm run ingest -- --check # dry-run: parse + validate + report only; writes 0 rows
```

Exit codes: `0` success / `--check` passed · `1` validation failure (0 rows persisted) · `2`
source unreadable / missing `IMAGE_SOURCE_DIR` · `3` DB transaction error (rolled back, prior
catalog intact). The zh-TW report (totals, per-region counts, 134-diagnosis reconciliation,
high-risk set, re-run diff, warnings) prints to **stdout only**. Re-running on unchanged source is
idempotent. Read it back via `GET /api/regions|blueprints|blueprints/:id|diagnoses` and
`GET /api/blueprints/:id/image` (any authenticated role).

## API surface (feature 001)

`/api/auth`: `POST /login`, `POST /password`, `GET /session`, `POST /logout`.
`/api/admin/accounts` (role ADMIN): `POST /`, `GET /`, `GET /:id`, `POST /:id/disable`,
`POST /:id/enable`, `POST /:id/reset-credential`. Envelope: `{ success, data, error:{code,message}, meta? }`.
There is **no** registration endpoint (constitution III); probing one returns a 404 envelope.

## Security notes

argon2id hashing; opaque session token (only its SHA-256 hash stored); httpOnly `pie_sid` +
double-submit `pie_csrf`; generic constant-time login failure (`帳號或密碼錯誤`); rate-limited
login; append-only audit trail. Secrets never logged.

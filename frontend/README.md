# frontend — physical-image-eval

React + Vite + TypeScript + Tailwind + React Router + TanStack Query. Runs on **:5180**
(constitution X) and proxies `/api` → backend **:3100** so cookies + CSRF behave like prod.
All UI copy is 繁體中文 (constitution VIII); there is no language switcher.

## Setup

```bash
# from repo root
npm install

# frontend/
npm run dev        # http://localhost:5180 (needs the backend running on :3100)
npm run build      # production build (served by nginx in the Docker image)
```

## Screens (feature 001)

- `/login` — the **only** public screen (constitution III; no registration anywhere).
- `/password/change` — forced/voluntary password change (FR-009).
- `/progress` — reviewer landing, 0／51 start (placeholder owned by feature 003).
- `/admin/accounts`, `/admin/accounts/new` — admin account management (ADMIN only).

Routing guards (`ProtectedRoute`, `RoleGate`) are **defense-in-depth only** — the server
enforces every gate. Auth state is restored on reopen via `GET /api/auth/session`.

## Tests (Vitest + React Testing Library, coverage ≥ 80%)

```bash
npm run test            # component + hook tests (jsdom)
npm run test:coverage   # enforces ≥ 80%
```

## Accessibility (constitution IX)

Native keyboard-operable forms; inputs have associated `<label>`s; error/status conveyed by
**text + icon**, not color alone; account status badges include text (在職／非在職). Desktop/laptop
first.

import 'dotenv/config'; // load backend/.env BEFORE env.ts validates (must be first)
import { app } from './app';
import { env } from './config/env';

/**
 * Startup entry. env.ts has already validated all required secrets at import (fail-fast,
 * constitution V) — if anything is missing the process exits before listening.
 */
app.listen(env.PORT, () => {
  // No secrets in logs (constitution V).
  console.log(`[pie] backend listening on :${env.PORT} (${env.NODE_ENV})`);
});

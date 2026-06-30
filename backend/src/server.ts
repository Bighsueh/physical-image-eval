import 'dotenv/config'; // load backend/.env BEFORE env.ts validates (must be first)
import { app } from './app';
import { env } from './config/env';
import { prisma } from './lib/prisma';

/**
 * Startup entry. env.ts has already validated all required secrets at import (fail-fast,
 * constitution V) — if anything is missing the process exits before listening.
 */
const server = app.listen(env.PORT, () => {
  // No secrets in logs (constitution V).
  console.log(`[pie] backend listening on :${env.PORT} (${env.NODE_ENV})`);
});

// Graceful shutdown: stop accepting connections, then close the DB pool (clean docker stop).
const shutdown = (signal: string) => {
  console.log(`[pie] ${signal} received — shutting down`);
  server.close(() => {
    prisma.$disconnect().finally(() => process.exit(0));
  });
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

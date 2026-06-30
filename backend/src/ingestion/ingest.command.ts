import 'dotenv/config'; // load backend/.env BEFORE env.ts validates (must be first)
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { runIngest } from './runner';

/**
 * Operator CLI (T024/T040). `npm run ingest` (write) / `npm run ingest -- --check` (dry-run).
 * Reads the source from IMAGE_SOURCE_DIR; prints the zh-TW report to STDOUT only (never into the
 * source dir — constitution II / FR-001); exits with the contract exit code.
 */
const check = process.argv.includes('--check');

runIngest({ sourceDir: env.IMAGE_SOURCE_DIR, check })
  .then(async (result) => {
    // eslint-disable-next-line no-console
    console.log(result.renderedReport);
    await prisma.$disconnect();
    process.exit(result.exitCode);
  })
  .catch(async (err) => {
    // eslint-disable-next-line no-console
    console.error('❌ 匯入發生未預期錯誤：', err instanceof Error ? err.message : err);
    await prisma.$disconnect();
    process.exit(3);
  });

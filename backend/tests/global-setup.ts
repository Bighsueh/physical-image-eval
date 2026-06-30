import { execSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

/**
 * One-time test setup: ensure a dedicated TEST database exists and is migrated to the current
 * schema. Runs in the Vitest main process (test.env is NOT applied here, so values are explicit).
 * Uses the dev Postgres on 5433 (constitution X). No real secrets.
 */
const TEST_DB = 'physical_image_eval_test';
const HOST = 'postgresql://pie:pie@localhost:5433';
const maintenanceUrl = `${HOST}/physical_image_eval?schema=public`;
const testUrl = `${HOST}/${TEST_DB}?schema=public`;

const backendDir = dirname(dirname(fileURLToPath(import.meta.url)));

export default async function setup(): Promise<void> {
  // 1. Create the test database if it does not exist (CREATE DATABASE can't run in a tx).
  const admin = new PrismaClient({ datasources: { db: { url: maintenanceUrl } } });
  try {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${TEST_DB}"`);
  } catch (err) {
    // 42P04 = duplicate_database — fine, it already exists.
    const message = err instanceof Error ? err.message : String(err);
    if (!/already exists|42P04|P2010/i.test(message)) throw err;
  } finally {
    await admin.$disconnect();
  }

  // 2. Apply migrations to the test DB.
  execSync('npx prisma migrate deploy', {
    cwd: backendDir,
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: 'ignore',
  });
}

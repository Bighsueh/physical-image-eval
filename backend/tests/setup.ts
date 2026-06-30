import { afterAll, beforeEach } from 'vitest';
import { prisma } from '../src/lib/prisma';

/**
 * Per-test isolation: truncate all auth tables before each test (constitution VII). The Prisma
 * singleton is bound to the TEST database via vitest `test.env` (DATABASE_URL). Order respects
 * FKs via CASCADE; RESTART IDENTITY keeps tests deterministic.
 */
beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "AuditLog", "Session", "Account" RESTART IDENTITY CASCADE',
  );
});

afterAll(async () => {
  await prisma.$disconnect();
});

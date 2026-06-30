import { PrismaClient, type Prisma } from '@prisma/client';

/** Accepts either the base client or a transaction client — repos run in/out of a tx (D9). */
export type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Prisma client singleton (constitution VI). Reuses one client across hot-reloads / test
 * workers to avoid exhausting connections. DATABASE_URL is read from the environment.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

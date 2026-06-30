-- Hard account deletion support (admin batch delete; only for accounts with no submitted reviews).
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'DELETE_ACCOUNT';

-- AuditLog refs SetNull on delete so deleting an account preserves its audit rows (append-only).
ALTER TABLE "AuditLog" ALTER COLUMN "targetAccountId" DROP NOT NULL;
ALTER TABLE "AuditLog" DROP CONSTRAINT IF EXISTS "AuditLog_targetAccountId_fkey";
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_targetAccountId_fkey"
  FOREIGN KEY ("targetAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditLog" DROP CONSTRAINT IF EXISTS "AuditLog_actorAccountId_fkey";
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorAccountId_fkey"
  FOREIGN KEY ("actorAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Account.createdBy SetNull so deleting a creator doesn't block on accounts they created.
ALTER TABLE "Account" DROP CONSTRAINT IF EXISTS "Account_createdByAccountId_fkey";
ALTER TABLE "Account" ADD CONSTRAINT "Account_createdByAccountId_fkey"
  FOREIGN KEY ("createdByAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

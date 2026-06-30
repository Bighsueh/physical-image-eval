import { execSync } from 'node:child_process';

/**
 * Reset the dev database to a clean bootstrap state before the E2E run, so the admin first-login
 * + forced-change flow is deterministic across repeated runs. Talks to the local Postgres and the
 * idempotent seed directly (no special test endpoints — constitution III).
 */
export default function globalSetup(): void {
  const sql = 'TRUNCATE TABLE "AuditLog","Session","Account" RESTART IDENTITY CASCADE;';
  execSync('docker compose exec -T postgres psql -U pie -d physical_image_eval', {
    input: sql,
    stdio: ['pipe', 'ignore', 'ignore'],
  });
  execSync('npm run seed:bootstrap-admin -w backend', { stdio: 'ignore' });
}

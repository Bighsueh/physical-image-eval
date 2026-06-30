import 'dotenv/config'; // load backend/.env BEFORE env.ts validates (must be first)
import { env } from '../../src/config/env';
import { prisma } from '../../src/lib/prisma';
import { bootstrapAdmin } from '../../src/services/bootstrap.service';

/**
 * Deploy-time first-admin seed (FR-020, D5). Idempotent: creates the first ADMIN only if none
 * exists, otherwise a no-op — safe to re-run on every deploy. There is NO HTTP path for this
 * (constitution III). Credentials come from env (validated present at startup); never logged.
 */
async function main(): Promise<void> {
  const result = await bootstrapAdmin(env.BOOTSTRAP_ADMIN_USERNAME, env.BOOTSTRAP_ADMIN_PASSWORD);
  if (result.created) {
    console.log(
      `[seed] 已建立首位系統管理員：${result.account?.username}（首次登入須變更密碼）`,
    );
  } else {
    console.log('[seed] 已存在系統管理員，略過 bootstrap。');
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error('[seed] bootstrap 失敗：', err instanceof Error ? err.message : err);
    await prisma.$disconnect();
    process.exit(1);
  });

import { z } from 'zod';

/**
 * Zod-validated environment (constitution V — secrets via env, validated present at startup,
 * fail-fast). Never logs secret VALUES (only the names/messages of missing/invalid vars).
 * Excluded from coverage (config). Durations like "12h"/"60m"/"15m" parse to milliseconds.
 */

const durationToMs = (value: string): number => {
  const match = /^(\d+)\s*(ms|s|m|h|d)$/.exec(value.trim());
  if (!match) throw new Error(`無效的時間長度：${value}（需如 12h / 60m / 30s）`);
  const amount = Number(match[1]);
  const unit = match[2] as 'ms' | 's' | 'm' | 'h' | 'd';
  const multiplier = { ms: 1, s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit];
  return amount * multiplier;
};

const durationSchema = z.string().min(1).transform(durationToMs);
const boolSchema = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3100),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL 必填'),

  SESSION_ABSOLUTE_TTL: durationSchema, // absolute session lifetime (ms)
  SESSION_IDLE_TTL: durationSchema, // idle/sliding timeout (ms)

  COOKIE_SECURE: boolSchema,
  COOKIE_DOMAIN: z.string().default(''),
  COOKIE_SID_NAME: z.string().min(1).default('pie_sid'),
  COOKIE_CSRF_NAME: z.string().min(1).default('pie_csrf'),

  ARGON2_MEMORY_KIB: z.coerce.number().int().positive(),
  ARGON2_ITERATIONS: z.coerce.number().int().positive(),
  ARGON2_PARALLELISM: z.coerce.number().int().positive(),

  LOGIN_RATE_MAX: z.coerce.number().int().positive(),
  LOGIN_RATE_WINDOW: durationSchema, // rate-limit window (ms)

  BOOTSTRAP_ADMIN_USERNAME: z.string().min(1, 'BOOTSTRAP_ADMIN_USERNAME 必填'),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().min(1, 'BOOTSTRAP_ADMIN_PASSWORD 必填'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const detail = parsed.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ');
  // Names + messages only — never the secret values.
  throw new Error(`[env] 環境變數驗證失敗：${detail}`);
}

export const env = parsed.data;
export type Env = typeof env;

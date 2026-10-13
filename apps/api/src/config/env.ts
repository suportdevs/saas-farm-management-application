import { z } from 'zod';

try {
  process.loadEnvFile('.env');
} catch {
  // .env is optional — in production variables usually come from the environment.
}

const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => v === true || v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  APP_NAME: z.string().default('SaaS Kit'),
  WEB_URL: z.url().default('http://localhost:3000'),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  TRUST_PROXY: z.string().default('loopback'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  APP_SECRET: z.string().min(32, 'APP_SECRET must be at least 32 characters'),
  SESSION_COOKIE_NAME: z.string().default('sid'),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_SECURE: bool.default(false),
  MAIL_FROM: z.string().default('SaaS Kit <no-reply@example.com>'),

  // ─── Auth behaviour ───
  // off: never ask · optional: banner + reminders · required: block the app until verified
  EMAIL_VERIFICATION: z.enum(['off', 'optional', 'required']).default('optional'),
  // Failed sign-ins (per account + IP) before a temporary lock. 0 disables lockout.
  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().min(0).default(5),
  LOGIN_LOCKOUT_MINUTES: z.coerce.number().int().min(1).default(15),
  CAPTCHA_ENABLED: bool.default(false),
  CAPTCHA_FORMS: z
    .string()
    .default('login,register,forgot-password,magic-link')
    .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean)),
  // Users who sign up (and verify) with one of these emails become admins automatically.
  ADMIN_EMAILS: z
    .string()
    .default('')
    .transform((v) => v.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)),
  SEND_WELCOME_EMAIL: bool.default(true),

  // "postgres" shares rate-limit counters between API instances; "memory" is per process.
  RATE_LIMIT_STORE: z.enum(['memory', 'postgres']).default('memory'),
  // Run the background job worker inside the API process. Set to false when
  // running a dedicated worker (`node dist/worker.js`).
  RUN_WORKER: bool.default(true),
  JOB_POLL_INTERVAL_MS: z.coerce.number().int().min(100).default(1000),
  JOB_CONCURRENCY: z.coerce.number().int().min(1).max(50).default(5),
  AUDIT_LOG_RETENTION_DAYS: z.coerce.number().int().min(1).default(365),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  for (const issue of parsed.error.issues) {
    console.error(`   ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

/**
 * Helper for modules to validate their own env vars at startup.
 * Fails fast with a readable message instead of crashing at first use.
 */
export function parseModuleEnv<T extends z.ZodType>(moduleName: string, moduleSchema: T): z.infer<T> {
  const result = moduleSchema.safeParse(process.env);
  if (!result.success) {
    console.error(`❌ Invalid environment variables for module "${moduleName}":`);
    for (const issue of result.error.issues) {
      console.error(`   ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }
  return result.data;
}

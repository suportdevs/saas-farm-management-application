import { defineConfig } from 'drizzle-kit';

try {
  process.loadEnvFile('.env');
} catch {
  // .env is optional (e.g. CI provides env vars directly)
}

export default defineConfig({
  dialect: 'postgresql',
  // Core tables + one `schema.ts` per installed module.
  schema: ['./src/db/schema.ts', './src/modules/*/schema.ts'],
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL! },
  strict: true,
  verbose: true,
});

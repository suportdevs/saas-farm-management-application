import { defineConfig } from 'drizzle-kit';

try {
  process.loadEnvFile('.env');
} catch {
  // .env is optional (e.g. CI provides env vars directly)
}

export default defineConfig({
  dialect: 'postgresql',
  // Core tables, product modules' models (one table group per *.model.ts) and kit-installed modules' schema.ts.
  schema: ['./src/db/schema.ts', './src/modules/*/models/*.model.ts', './src/modules/*/schema.ts'],
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL! },
  strict: true,
  verbose: true,
});

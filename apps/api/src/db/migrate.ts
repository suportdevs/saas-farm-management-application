import path from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from './client';

const migrationsFolder = path.resolve(process.cwd(), 'drizzle');

async function main() {
  console.log(`⏳ Running migrations from ${migrationsFolder}`);
  await migrate(db, { migrationsFolder });
  console.log('✅ Migrations complete');
}

main()
  .catch((err) => {
    console.error('❌ Migration failed', err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());

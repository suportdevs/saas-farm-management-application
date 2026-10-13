import fs from 'node:fs';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { db } from './client';

/**
 * Lists migrations in ./drizzle that the database hasn't applied yet, by
 * comparing the journal with drizzle's own bookkeeping table. Returns null
 * when it can't tell (e.g. no journal in this build).
 */
export async function pendingMigrations(): Promise<string[] | null> {
  const journalPath = path.resolve(process.cwd(), 'drizzle/meta/_journal.json');
  if (!fs.existsSync(journalPath)) return null;
  const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8')) as { entries: { tag: string; when: number }[] };

  let latest = 0;
  try {
    const result = await db.execute<{ created_at: string }>(
      sql`select max(created_at) as created_at from drizzle.__drizzle_migrations`,
    );
    latest = Number(result.rows[0]?.created_at ?? 0);
  } catch {
    // Table missing: nothing has been migrated yet.
  }
  return journal.entries.filter((e) => e.when > latest).map((e) => e.tag);
}

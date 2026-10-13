import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { defineJob, enqueue, worker } from '../src/core/jobs';
import { db, pool } from '../src/db/client';
import { jobs } from '../src/db/schema';
import { PostgresStore } from '../src/middleware/rate-limit';

afterAll(async () => {
  await pool.end();
});

describe('job queue', () => {
  it('runs due jobs and de-duplicates unique keys', async () => {
    const seen: number[] = [];
    const job = defineJob<{ n: number }>(`test.collect.${Date.now()}`, ({ n }) => {
      seen.push(n);
    });
    const key = `only-once-${Date.now()}`;
    await job.enqueue({ n: 1 });
    await job.enqueue({ n: 2 }, { uniqueKey: key });
    await job.enqueue({ n: 3 }, { uniqueKey: key });
    await job.enqueue({ n: 4 }, { delayMs: 60_000 }); // not due yet
    await worker.drain();
    expect(seen.sort()).toEqual([1, 2]);
  });

  it('retries failures with backoff, then gives up', async () => {
    let calls = 0;
    const name = `test.flaky.${Date.now()}`;
    defineJob(name, () => {
      calls++;
      throw new Error('boom');
    });
    await enqueue(name, null, { maxAttempts: 2 });
    await worker.drain();
    let [row] = await db.select().from(jobs).where(eq(jobs.name, name));
    expect(row).toMatchObject({ status: 'pending', attempts: 1, lastError: 'boom' });

    await db.update(jobs).set({ runAt: new Date() }).where(eq(jobs.id, row!.id)); // skip the backoff
    await worker.drain();
    [row] = await db.select().from(jobs).where(eq(jobs.id, row!.id));
    expect(row).toMatchObject({ status: 'failed', attempts: 2 });
    expect(calls).toBe(2);
  });
});

describe('postgres rate-limit store', () => {
  it('counts hits per key and resets after the window', async () => {
    const store = new PostgresStore(`test-${Date.now()}:`);
    store.init({ windowMs: 60_000 } as never);
    expect((await store.increment('ip')).totalHits).toBe(1);
    expect((await store.increment('ip')).totalHits).toBe(2);
    await store.decrement('ip');
    expect((await store.increment('ip')).totalHits).toBe(2);
    await store.resetKey('ip');
    expect((await store.increment('ip')).totalHits).toBe(1);

    store.init({ windowMs: 1 } as never);
    await store.increment('fast');
    await new Promise((r) => setTimeout(r, 20));
    expect((await store.increment('fast')).totalHits).toBe(1);
  });
});

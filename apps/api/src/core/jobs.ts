import { and, eq, inArray, lt, lte, sql } from 'drizzle-orm';
import { env } from '../config/env';
import { db } from '../db/client';
import { jobs, type Job } from '../db/schema';
import { logger } from '../lib/logger';

/**
 * Durable background jobs backed by Postgres — no Redis required.
 *
 *   const welcome = defineJob('mail.welcome', async ({ userId }: { userId: string }) => { … });
 *   await welcome.enqueue({ userId }, { delayMs: 60_000 });
 *
 *   schedule('reports.daily', 24 * HOUR, async () => { … });  // runs once per interval across all instances
 *
 * Workers claim rows with `FOR UPDATE SKIP LOCKED`, so any number of API or
 * worker processes can run side by side. Failed jobs are retried with
 * exponential backoff until `maxAttempts` is reached.
 */

export type JobHandler<T = unknown> = (payload: T, job: Job) => Promise<void> | void;

interface JobDefinition {
  handler: JobHandler<any>;
  maxAttempts: number;
}

export interface EnqueueOptions {
  delayMs?: number;
  runAt?: Date;
  maxAttempts?: number;
  /** Jobs with the same key are only enqueued once (until purged). */
  uniqueKey?: string;
}

const definitions = new Map<string, JobDefinition>();
const schedules: { name: string; everyMs: number }[] = [];

const STALE_AFTER_MS = 15 * 60 * 1000; // a running job not finished by then is assumed crashed
const MAX_BACKOFF_MS = 60 * 60 * 1000;

export function defineJob<T>(name: string, handler: JobHandler<T>, opts: { maxAttempts?: number } = {}) {
  if (definitions.has(name)) throw new Error(`Job "${name}" is already defined`);
  definitions.set(name, { handler, maxAttempts: opts.maxAttempts ?? 5 });
  return {
    name,
    enqueue: (payload: T, options?: EnqueueOptions) => enqueue(name, payload, options),
  };
}

export async function enqueue(name: string, payload: unknown, opts: EnqueueOptions = {}): Promise<void> {
  const runAt = opts.runAt ?? new Date(Date.now() + (opts.delayMs ?? 0));
  await db
    .insert(jobs)
    .values({
      name,
      payload: payload ?? null,
      runAt,
      maxAttempts: opts.maxAttempts ?? definitions.get(name)?.maxAttempts ?? 5,
      uniqueKey: opts.uniqueKey ?? null,
    })
    .onConflictDoNothing({ target: jobs.uniqueKey });
}

/**
 * Runs `handler` once every `everyMs` across the whole deployment. Each
 * interval maps to a unique job key, so concurrent workers can't double-run it.
 */
export function schedule(name: string, everyMs: number, handler: () => Promise<void> | void) {
  defineJob(`cron:${name}`, handler, { maxAttempts: 1 });
  schedules.push({ name, everyMs });
}

async function enqueueDueSchedules() {
  const now = Date.now();
  for (const s of schedules) {
    const bucket = Math.floor(now / s.everyMs);
    await enqueue(`cron:${s.name}`, null, { uniqueKey: `cron:${s.name}:${bucket}`, maxAttempts: 1 });
  }
}

async function claim(limit: number): Promise<Job[]> {
  const due = db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.status, 'pending'), lte(jobs.runAt, new Date())))
    .orderBy(jobs.runAt)
    .limit(limit)
    .for('update', { skipLocked: true });
  return db
    .update(jobs)
    .set({ status: 'running', lockedAt: new Date(), attempts: sql`${jobs.attempts} + 1` })
    .where(inArray(jobs.id, due))
    .returning();
}

async function recoverStaleJobs() {
  await db
    .update(jobs)
    .set({ status: 'pending', lockedAt: null, lastError: 'Worker timed out' })
    .where(and(eq(jobs.status, 'running'), lt(jobs.lockedAt, new Date(Date.now() - STALE_AFTER_MS))));
}

async function execute(job: Job) {
  const def = definitions.get(job.name);
  const log = logger.child({ job: job.name, jobId: job.id, attempt: job.attempts });
  try {
    if (!def) throw new Error(`No handler registered for job "${job.name}"`);
    await def.handler(job.payload, job);
    await db.update(jobs).set({ status: 'completed', lockedAt: null, lastError: null }).where(eq(jobs.id, job.id));
    log.debug('Job completed');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const giveUp = !def || job.attempts >= job.maxAttempts;
    const backoff = Math.min(2 ** job.attempts * 10_000, MAX_BACKOFF_MS);
    await db
      .update(jobs)
      .set({
        status: giveUp ? 'failed' : 'pending',
        lockedAt: null,
        lastError: message.slice(0, 2000),
        runAt: giveUp ? job.runAt : new Date(Date.now() + backoff),
      })
      .where(eq(jobs.id, job.id));
    if (giveUp) log.error({ err }, 'Job failed permanently');
    else log.warn({ err, retryInMs: backoff }, 'Job failed, will retry');
  }
}

/** Processes jobs until it is stopped. Safe to run in many processes at once. */
class Worker {
  private timer: NodeJS.Timeout | null = null;
  private running = new Set<Promise<void>>();
  private lastMaintenance = 0;
  private stopped = true;

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    logger.info({ jobs: [...definitions.keys()].length, concurrency: env.JOB_CONCURRENCY }, 'Job worker started');
    this.loop();
  }

  private loop = () => {
    if (this.stopped) return;
    this.tick()
      .catch((err) => logger.error({ err }, 'Job worker tick failed'))
      .finally(() => {
        if (!this.stopped) this.timer = setTimeout(this.loop, env.JOB_POLL_INTERVAL_MS);
      });
  };

  private async tick() {
    if (Date.now() - this.lastMaintenance > 30_000) {
      this.lastMaintenance = Date.now();
      await enqueueDueSchedules();
      await recoverStaleJobs();
    }
    const free = env.JOB_CONCURRENCY - this.running.size;
    if (free <= 0) return;
    for (const job of await claim(free)) {
      const p = execute(job).finally(() => this.running.delete(p));
      this.running.add(p);
    }
  }

  /** Stops polling and waits for in-flight jobs (up to `timeoutMs`). */
  async stop(timeoutMs = 8000) {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    await Promise.race([Promise.allSettled([...this.running]), new Promise((r) => setTimeout(r, timeoutMs))]);
  }

  /** Test helper: run everything that is due right now. */
  async drain() {
    let batch: Job[];
    do {
      batch = await claim(env.JOB_CONCURRENCY);
      await Promise.all(batch.map(execute));
    } while (batch.length);
  }
}

export const worker = new Worker();

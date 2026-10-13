// Dedicated background worker: `node dist/worker.js` (set RUN_WORKER=false on API instances).
import { createApp } from './app';
import { worker } from './core/jobs';
import { pool } from './db/client';
import { logger } from './lib/logger';

async function main() {
  // Builds the app without listening so every module registers its hooks and jobs.
  await createApp();
  worker.start();

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, stopping worker…`);
    setTimeout(() => process.exit(1), 15_000).unref();
    await worker.stop();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ err }, 'Failed to start worker');
  process.exit(1);
});

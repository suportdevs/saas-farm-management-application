import { env } from './config/env';
import { createApp } from './app';
import { worker } from './core/jobs';
import { pool } from './db/client';
import { pendingMigrations } from './db/migration-status';
import { logger } from './lib/logger';
import { appModules } from './modules/app-modules';
import { installedModules } from './modules/registry';

async function main() {
  // Missing tables otherwise surface as confusing 500s on sign-up/sign-in.
  const pending = await pendingMigrations().catch(() => null);
  if (pending?.length) {
    logger.error(
      { pending },
      `⚠️  ${pending.length} database migration(s) not applied — run "npm run db:migrate". Requests touching new tables will fail until then.`,
    );
  }

  const app = await createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(
      { modules: [...appModules, ...installedModules].map((m) => m.name) },
      `🚀 API listening on http://localhost:${env.PORT}`,
    );
  });
  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      logger.fatal(
        `Port ${env.PORT} is already in use by another process. Stop it, or set PORT in apps/api/.env and API_URL in apps/web/.env.local to a free port.`,
      );
    } else {
      logger.fatal({ err }, 'HTTP server error');
    }
    process.exit(1);
  });

  // Keep-alive must outlive the load balancer's idle timeout to avoid 502s.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  if (env.RUN_WORKER) worker.start();

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`${signal} received, shutting down…`);
    setTimeout(() => process.exit(1), 10_000).unref();
    server.close(async () => {
      await worker.stop();
      await pool.end();
      process.exit(0);
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

process.on('unhandledRejection', (err) => logger.error({ err }, 'Unhandled promise rejection'));

main().catch((err) => {
  logger.fatal({ err }, 'Failed to start server');
  process.exit(1);
});

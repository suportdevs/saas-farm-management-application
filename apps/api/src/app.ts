import { randomUUID } from 'node:crypto';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { sql } from 'drizzle-orm';
import { env } from './config/env';
import { registerAccountHooks } from './core/accounts';
import { requestContext } from './core/context';
import { hooks } from './core/hooks';
import { registerMaintenanceTasks } from './core/maintenance';
import { db } from './db/client';
import { logger } from './lib/logger';
import { enforceEmailVerification, loadSession } from './middleware/auth';
import { csrfGuard } from './middleware/csrf';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { apiLimiter } from './middleware/rate-limit';
import { adminRouter } from './modules/admin/routes';
import { authRouter } from './modules/auth/routes';
import { appModules } from './modules/app-modules';
import { installedModules } from './modules/registry';
import { usersRouter } from './modules/users/routes';

// Product modules first (in dependency order), then modules installed with the kit CLI.
const modules = [...appModules, ...installedModules];

let initialized = false;

export async function createApp(): Promise<Express> {
  const app = express();

  const trustProxy = Number(env.TRUST_PROXY);
  app.set('trust proxy', Number.isNaN(trustProxy) ? env.TRUST_PROXY : trustProxy);
  app.disable('x-powered-by');

  app.use(
    pinoHttp({
      logger,
      // Reuse an upstream request id (load balancer / Next.js) or mint one, and echo it back.
      genReqId: (req, res) => {
        const incoming = req.headers['x-request-id'];
        const id = typeof incoming === 'string' && /^[\w.-]{1,100}$/.test(incoming) ? incoming : randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
      autoLogging: { ignore: (req) => req.url?.startsWith('/api/health') ?? false },
    }),
  );
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGINS, credentials: true }));
  app.use(compression());
  app.use(
    express.json({
      limit: '1mb',
      // Keep the raw bytes for webhook signature verification (e.g. Stripe).
      verify: (req, _res, buf) => {
        (req as express.Request).rawBody = buf;
      },
    }),
  );
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(cookieParser());

  // Liveness: the process is up. Readiness: it can reach the database.
  app.get('/api/health/live', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.get('/api/health', async (req, res) => {
    try {
      await db.execute(sql`select 1`);
      res.json({ status: 'ok', uptime: process.uptime() });
    } catch (err) {
      req.log.error({ err }, 'Health check failed');
      res.status(503).json({ status: 'error', database: 'unreachable' });
    }
  });

  const api = express.Router();
  api.use(apiLimiter);
  api.use(csrfGuard);
  api.use(requestContext);
  api.use(loadSession);
  api.use(enforceEmailVerification);

  api.get('/features', async (_req, res) => {
    const extras = await Promise.all(hooks.featureProviders.map((fn) => fn()));
    const auth = {
      emailVerification: env.EMAIL_VERIFICATION,
      captcha: env.CAPTCHA_ENABLED ? env.CAPTCHA_FORMS : [],
      lockout: env.LOGIN_MAX_ATTEMPTS > 0 ? { maxAttempts: env.LOGIN_MAX_ATTEMPTS, minutes: env.LOGIN_LOCKOUT_MINUTES } : null,
    };
    res.json(Object.assign({ modules: modules.map((m) => m.name), auth }, ...extras));
  });

  // Hooks, jobs and schedules are process-wide: register them only once even
  // if createApp() is called again (e.g. by tests).
  if (!initialized) {
    initialized = true;
    registerMaintenanceTasks();
    registerAccountHooks();
    // Modules set up first so their hooks are in place before any request.
    for (const mod of modules) {
      await mod.setup?.({ app, hooks, logger: logger.child({ module: mod.name }) });
    }
  }

  api.use('/auth', authRouter);
  api.use('/users', usersRouter);
  api.use('/admin', adminRouter);
  for (const mod of modules) {
    if (mod.router) api.use(`/${mod.basePath ?? mod.name}`, mod.router);
  }

  // Third-party callbacks (webhooks) skip the CSRF guard, rate limiter and session loading.
  for (const mod of modules) {
    if (mod.publicRouter) app.use(`/api/${mod.publicBasePath ?? mod.basePath ?? mod.name}`, mod.publicRouter);
  }
  app.use('/api', api);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

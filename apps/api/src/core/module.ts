import type { Express, Router } from 'express';
import type { Hooks } from './hooks';
import type { Logger } from 'pino';

export interface ModuleContext {
  app: Express;
  hooks: Hooks;
  logger: Logger;
}

export interface ApiModule {
  /** Unique module name — must match the folder name and the CLI module id. */
  name: string;
  /** Express router mounted at `/api/<basePath>`. */
  router?: Router;
  /**
   * Mounted at `/api/<basePath>` *before* the CSRF guard, rate limiter and
   * session middleware — for webhooks and other server-to-server callbacks
   * that must verify their own signatures. `req.rawBody` holds the raw bytes.
   */
  publicRouter?: Router;
  /** Defaults to the module name. */
  basePath?: string;
  /** Where  is mounted. Defaults to . */
  publicBasePath?: string;
  /** Runs once per process at startup, before routes are mounted. Register hooks, jobs and schedules here. */
  setup?: (ctx: ModuleContext) => void | Promise<void>;
}

export const defineModule = (mod: ApiModule): ApiModule => mod;

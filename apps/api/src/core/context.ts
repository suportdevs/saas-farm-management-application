import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextFunction, Request, Response } from 'express';

const storage = new AsyncLocalStorage<{ req: Request }>();

/** Middleware: makes the current request available to code without a `req` argument (e.g. hooks). */
export function requestContext(req: Request, _res: Response, next: NextFunction) {
  storage.run({ req }, next);
}

/** The request being handled, if any (undefined in jobs and scripts). */
export const currentRequest = (): Request | undefined => storage.getStore()?.req;

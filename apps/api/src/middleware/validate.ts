import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { validationError } from '../lib/errors';

type Source = 'body' | 'query' | 'params';

export function zodDetails(error: z.ZodError): Record<string, string[]> {
  const details: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    (details[key] ??= []).push(issue.message);
  }
  return details;
}

/**
 * Validates and replaces `req[source]` with the parsed value.
 * Use `req.body as z.infer<typeof schema>` (or `parsed<T>(req)`) in handlers.
 */
export function validate(schema: z.ZodType, source: Source = 'body') {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source] ?? {});
    if (!result.success) throw validationError(zodDetails(result.error));
    if (source === 'query') {
      // req.query is a getter in Express 5 — redefine it.
      Object.defineProperty(req, 'query', { value: result.data, writable: true });
    } else {
      req[source] = result.data;
    }
    next();
  };
}

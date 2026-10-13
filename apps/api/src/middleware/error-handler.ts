import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { ApiErrorBody } from '@kit/shared';
import { isProd } from '../config/env';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';

export const notFoundHandler: RequestHandler = (req, res) => {
  const body: ApiErrorBody = { error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` } };
  res.status(404).json(body);
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof AppError) {
    const body: ApiErrorBody = { error: { code: err.code, message: err.message, details: err.details } };
    return res.status(err.status).json(body);
  }

  // Malformed JSON body, oversized payload etc. from body-parser.
  if (err && typeof err === 'object' && 'type' in err && typeof err.status === 'number' && err.status < 500) {
    const body: ApiErrorBody = { error: { code: 'BAD_REQUEST', message: err.message } };
    return res.status(err.status).json(body);
  }

  (req.log ?? logger).error({ err }, 'Unhandled error');
  const body: ApiErrorBody = {
    error: {
      code: 'INTERNAL_ERROR',
      message: isProd ? 'Something went wrong' : (err as Error)?.message ?? 'Unknown error',
      // Lets users quote an id that support can find in the logs.
      requestId: typeof req.id === 'string' ? req.id : undefined,
    },
  };
  res.status(500).json(body);
};

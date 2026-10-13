import type { NextFunction, Request, Response } from 'express';
import { forbidden } from '../lib/errors';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF protection for cookie auth: state-changing requests must carry a custom
 * header. Browsers can't add custom headers cross-site without a CORS
 * preflight, which our CORS policy rejects for unknown origins. Combined with
 * SameSite=Lax cookies this blocks cross-site request forgery.
 */
export function csrfGuard(req: Request, _res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) return next();
  if (req.get('x-requested-with')) return next();
  throw forbidden('Missing X-Requested-With header', 'CSRF_CHECK_FAILED');
}

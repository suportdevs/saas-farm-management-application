import type { Request, Response } from 'express';
import { publicPlans } from '../services/plan.service';

/** GET /api/billing/plans — public: the pricing page lists these. */
export function list(_req: Request, res: Response) {
  res.set('Cache-Control', 'public, max-age=60').json({ plans: publicPlans() });
}

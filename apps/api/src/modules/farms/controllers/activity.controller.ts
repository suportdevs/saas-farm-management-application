import type { Request, Response } from 'express';
import { getFarm } from '../middleware/farm-access.middleware';
import { listActivity } from '../services/activity.service';
import type { ActivityQuery } from '../validators/activity.validator';

/** GET /:farm/activity */
export async function list(req: Request, res: Response) {
  const { page, pageSize } = req.query as unknown as ActivityQuery;
  const { entries, total } = await listActivity(getFarm(res).farm.id, { limit: pageSize, offset: (page - 1) * pageSize });
  res.json({ entries, pagination: { page, pageSize, total } });
}

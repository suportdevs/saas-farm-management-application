import type { Request, Response } from 'express';
import type { AdminOrganizationListQuery } from '@kit/shared';
import { listClientOrganizations } from '../services/tenant.service';

/** GET / — client organizations (search by name or owner email). */
export async function list(req: Request, res: Response) {
  res.json(await listClientOrganizations(req.query as unknown as AdminOrganizationListQuery));
}

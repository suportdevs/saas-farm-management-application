import type { Request, Response } from 'express';
import type { AuditLogQuery } from '@kit/shared';
import { listAuditEvents } from '../services/audit-log.service';

/** GET /audit-logs */
export async function list(req: Request, res: Response) {
  res.json(await listAuditEvents(req.query as unknown as AuditLogQuery));
}

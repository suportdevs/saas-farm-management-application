import type { Request, Response } from 'express';
import { platformInfo } from '../services/system.service';

/** GET /system — runtime, database and configuration status of the platform. */
export async function info(_req: Request, res: Response) {
  res.json(await platformInfo());
}

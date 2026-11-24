import type { Request, Response } from 'express';
import { z } from 'zod';
import type { FinishReceiveInput, FinishReceiveListQuery } from '@kit/shared';
import { audit, notFound } from '../../../core';
import { getFarm } from '../../farms';
import { createFinishReceive, deleteFinishReceive, getFinishReceive, listFinishReceives, processFinishReceive, updateFinishReceive } from '../services/finish-receive.service';

const keyParam = (req: Request) => {
  const key = z.uuid().safeParse(req.params.key);
  if (!key.success) throw notFound('Finish receive not found');
  return key.data;
};

/** Writes to the farm's activity log. */
const record = (req: Request, farmId: string, action: string, metadata: Record<string, unknown>) =>
  audit(req, { action: `feed.${action}`, targetType: 'farm', targetId: farmId, metadata: { resource: 'finish-receives', ...metadata } });

/** Request → service → activity log → response. */
export const finishReceiveController = {
  /** GET / — paginated list (?q, status, warehouse, from, to, page, pageSize). */
  async list(req: Request, res: Response) {
    res.json(await listFinishReceives(getFarm(res).farm.id, req.query as unknown as FinishReceiveListQuery));
  },

  /** GET /:key — the receive with its lines. */
  async show(req: Request, res: Response) {
    res.json(await getFinishReceive(getFarm(res).farm.id, keyParam(req)));
  },

  /** POST / */
  async create(req: Request, res: Response) {
    const farmId = getFarm(res).farm.id;
    const receive = await createFinishReceive(farmId, req.auth!.user.id, req.body as FinishReceiveInput);
    await record(req, farmId, 'created', { name: receive.orderNo, count: receive.lines.length });
    res.status(201).json(receive);
  },

  /** PUT /:key — pending receives only. */
  async update(req: Request, res: Response) {
    const farmId = getFarm(res).farm.id;
    const receive = await updateFinishReceive(farmId, req.auth!.user.id, keyParam(req), req.body as FinishReceiveInput);
    await record(req, farmId, 'updated', { name: receive.orderNo, count: receive.lines.length });
    res.json(receive);
  },

  /** POST /:key/process — Pending → Processed (header and lines). */
  async process(req: Request, res: Response) {
    const farmId = getFarm(res).farm.id;
    const receive = await processFinishReceive(farmId, req.auth!.user.id, keyParam(req));
    await record(req, farmId, 'processed', { name: receive.orderNo, count: receive.lines.length });
    res.json(receive);
  },

  /** DELETE /:key — pending receives only. */
  async remove(req: Request, res: Response) {
    const farmId = getFarm(res).farm.id;
    const key = keyParam(req);
    const { orderNo } = await getFinishReceive(farmId, key);
    await deleteFinishReceive(farmId, req.auth!.user.id, key);
    await record(req, farmId, 'deleted', { name: orderNo });
    res.status(204).end();
  },
};

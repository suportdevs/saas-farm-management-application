import type { Request, Response } from 'express';
import { z } from 'zod';
import type { PurchaseInput, PurchaseListQuery } from '@kit/shared';
import { audit, notFound } from '../../../core';
import { getFarm } from '../../farms';
import { createPurchase, deletePurchase, getPurchase, listPurchaseItems, listPurchases, updatePurchase } from '../services/purchase.service';

const keyParam = (req: Request) => {
  const key = z.uuid().safeParse(req.params.key);
  if (!key.success) throw notFound('Purchase not found');
  return key.data;
};

/** Writes to the farm's activity log. */
const record = (req: Request, farmId: string, action: string, metadata: Record<string, unknown>) =>
  audit(req, { action: `purchase.${action}`, targetType: 'farm', targetId: farmId, metadata });

/** Request → service → activity log → response. */
export const purchaseController = {
  /** GET / — paginated list (?q, source_type, from, to, page, pageSize). */
  async list(req: Request, res: Response) {
    res.json(await listPurchases(getFarm(res).farm.id, req.query as unknown as PurchaseListQuery));
  },

  /** GET /purchase-items — every animal line with its purchase (same filters as the list). */
  async items(req: Request, res: Response) {
    res.json(await listPurchaseItems(getFarm(res).farm.id, req.query as unknown as PurchaseListQuery));
  },

  /** GET /:key — the purchase with its animal lines. */
  async show(req: Request, res: Response) {
    res.json(await getPurchase(getFarm(res).farm.id, keyParam(req)));
  },

  /** POST / */
  async create(req: Request, res: Response) {
    const farmId = getFarm(res).farm.id;
    const body = req.body as PurchaseInput;
    const purchase = await createPurchase(farmId, req.auth!.user.id, body);
    await record(req, farmId, 'created', { name: purchase.number, count: purchase.animals });
    res.status(201).json(purchase);
  },

  /** PUT /:key */
  async update(req: Request, res: Response) {
    const farmId = getFarm(res).farm.id;
    const purchase = await updatePurchase(farmId, req.auth!.user.id, keyParam(req), req.body as PurchaseInput);
    await record(req, farmId, 'updated', { name: purchase.number, count: purchase.animals });
    res.json(purchase);
  },

  /** DELETE /:key — also removes the animals it added. */
  async remove(req: Request, res: Response) {
    const farmId = getFarm(res).farm.id;
    const key = keyParam(req);
    const { number } = await getPurchase(farmId, key);
    const { animals } = await deletePurchase(farmId, req.auth!.user.id, key);
    await record(req, farmId, 'deleted', { name: number, count: animals });
    res.status(204).end();
  },
};

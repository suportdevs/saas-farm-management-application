import type { Request, Response } from 'express';
import type { CreatePlanData, UpdatePlanData } from '@kit/shared';
import { audit } from '../../../core';
import { createPlan, deletePlan, getAdminPlan, listAdminPlans, setPlanArchived, updatePlan } from '../../subscriptions';

const event = (planId: string) => ({ targetType: 'plan', targetId: planId });

/** GET / — every plan with its subscriber count. */
export async function list(_req: Request, res: Response) {
  res.json({ plans: await listAdminPlans() });
}

/** GET /:id */
export async function show(req: Request, res: Response) {
  res.json({ plan: await getAdminPlan(String(req.params.id)) });
}

/** POST / */
export async function create(req: Request, res: Response) {
  const input = req.body as CreatePlanData;
  const plan = await createPlan(req.auth!.user, input);
  await audit(req, { action: 'admin.plan.created', ...event(plan.id), metadata: { name: plan.name, prices: plan.prices, capabilities: plan.capabilities } });
  res.status(201).json({ plan });
}

/** PATCH /:id — farms on the plan get the new limits and modules straight away. */
export async function update(req: Request, res: Response) {
  const { before, plan, changed } = await updatePlan(req.auth!.user, String(req.params.id), req.body as UpdatePlanData);
  await audit(req, { action: 'admin.plan.updated', ...event(plan.id), metadata: { name: plan.name, changed, before: { prices: before.prices, limits: before.limits, capabilities: before.capabilities } } });
  res.json({ plan });
}

/** POST /:id/archive — existing subscribers keep it; nobody new can choose it. */
export async function archive(req: Request, res: Response) {
  const plan = await setPlanArchived(req.auth!.user, String(req.params.id), true);
  await audit(req, { action: 'admin.plan.archived', ...event(plan.id), metadata: { name: plan.name } });
  res.json({ plan });
}

/** POST /:id/restore */
export async function restore(req: Request, res: Response) {
  const plan = await setPlanArchived(req.auth!.user, String(req.params.id), false);
  await audit(req, { action: 'admin.plan.restored', ...event(plan.id), metadata: { name: plan.name } });
  res.json({ plan });
}

/** DELETE /:id — only plans nobody has used. */
export async function remove(req: Request, res: Response) {
  const plan = await deletePlan(String(req.params.id));
  await audit(req, { action: 'admin.plan.deleted', ...event(plan.id), metadata: { name: plan.name } });
  res.status(204).end();
}

import type { Request, Response } from 'express';
import type { z } from 'zod';
import type { adminExtendTrialSchema, adminSuspendFarmSchema, AdminFarmListQuery, AdminSetPlanInput } from '@kit/shared';
import { audit } from '../../../core';
import { createFarmForClient, deleteFarm, listMembers, setSuspended, type Farm } from '../../farms';
import { assertAssignable, extendTrial as extendFarmTrial, findSubscription, setManualPlan, subscriptionOf } from '../../subscriptions';
import { sendFarmSuspendedEmail } from '../services/email.service';
import { findTenant, listTenants, platformStats, tenantDetail } from '../services/tenant.service';

const event = (farm: Farm) => ({ targetType: 'farm', targetId: farm.id });

/** GET /stats */
export async function stats(_req: Request, res: Response) {
  res.json(await platformStats());
}

/** GET / — the farm directory. */
export async function list(req: Request, res: Response) {
  res.json(await listTenants(req.query as unknown as AdminFarmListQuery));
}

/** POST / — create a tenant for a client (the owner joins, or is invited). */
export async function create(req: Request, res: Response) {
  const input = req.body as Parameters<typeof createFarmForClient>[1] & { planId?: string; currentPeriodEnd?: string | null };
  // Checked before the farm exists, so a bad plan doesn't leave a half-made tenant.
  if (input.planId) assertAssignable(input.planId);
  const { farm, owner, invited } = await createFarmForClient(req.auth!.user, input);
  if (input.planId && input.planId !== 'free') {
    await setManualPlan(farm, input.planId, input.currentPeriodEnd ? new Date(input.currentPeriodEnd) : null);
  }
  await audit(req, {
    action: 'admin.farm.created',
    ...event(farm),
    metadata: { name: farm.name, ownerEmail: input.ownerEmail, invited, planId: input.planId ?? null },
  });
  res.status(201).json({ farm: { id: farm.id, slug: farm.slug, name: farm.name }, owner: owner && { id: owner.id, email: owner.email }, invited });
}

/** GET /:id */
export async function show(req: Request, res: Response) {
  res.json(await tenantDetail(await findTenant(String(req.params.id))));
}

/** PATCH /:id/plan — manual plan assignment (enterprise deals, invoiced customers, comps). */
export async function setPlan(req: Request, res: Response) {
  const farm = await findTenant(String(req.params.id));
  const { planId, currentPeriodEnd } = req.body as AdminSetPlanInput;
  const from = subscriptionOf(await findSubscription(farm.id)).planId;
  assertAssignable(planId, from);
  await setManualPlan(farm, planId, currentPeriodEnd ? new Date(currentPeriodEnd) : null);
  await audit(req, { action: 'admin.farm.plan_changed', ...event(farm), metadata: { from, to: planId, currentPeriodEnd } });
  res.status(204).end();
}

/** POST /:id/trial */
export async function extendTrial(req: Request, res: Response) {
  const farm = await findTenant(String(req.params.id));
  const { days } = req.body as z.infer<typeof adminExtendTrialSchema>;
  const trialEndsAt = await extendFarmTrial(farm.id, days);
  await audit(req, { action: 'admin.farm.trial_extended', ...event(farm), metadata: { days, trialEndsAt: trialEndsAt.toISOString() } });
  res.status(204).end();
}

/** POST /:id/suspend — the owners are told by email. */
export async function suspend(req: Request, res: Response) {
  const farm = await findTenant(String(req.params.id));
  const { reason } = req.body as z.infer<typeof adminSuspendFarmSchema>;
  await setSuspended(farm.id, reason || null);
  const owners = (await listMembers(farm.id)).filter((m) => m.role === 'owner');
  await Promise.all(owners.map((o) => sendFarmSuspendedEmail(o.email, o.name, farm, reason || null)));
  await audit(req, { action: 'admin.farm.suspended', ...event(farm), metadata: { reason } });
  res.status(204).end();
}

/** POST /:id/unsuspend */
export async function unsuspend(req: Request, res: Response) {
  const farm = await findTenant(String(req.params.id));
  await setSuspended(farm.id, null, false);
  await audit(req, { action: 'admin.farm.unsuspended', ...event(farm) });
  res.status(204).end();
}

/** DELETE /:id */
export async function remove(req: Request, res: Response) {
  const farm = await findTenant(String(req.params.id));
  await deleteFarm(farm);
  await audit(req, { action: 'admin.farm.deleted', ...event(farm), metadata: { name: farm.name } });
  res.status(204).end();
}

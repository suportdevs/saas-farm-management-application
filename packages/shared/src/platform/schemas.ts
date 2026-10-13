import { z } from 'zod';
import { PLAN_IDS } from '../subscriptions/plans';


export const adminFarmListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(100).optional(),
  plan: z.enum(PLAN_IDS).optional(),
  status: z.enum(['trialing', 'paying', 'free', 'past_due', 'suspended']).optional(),
  country: z.string().length(2).toUpperCase().optional(),
});
export type AdminFarmListQuery = z.infer<typeof adminFarmListQuerySchema>;

export const adminSetPlanSchema = z.object({
  planId: z.enum(PLAN_IDS),
  /** Manual (invoiced) subscriptions may end on a date; empty = open-ended. */
  currentPeriodEnd: z.iso.datetime({ offset: true }).nullable().optional(),
});
export type AdminSetPlanInput = z.infer<typeof adminSetPlanSchema>;

export const adminExtendTrialSchema = z.object({ days: z.coerce.number().int().min(1).max(365) });

export const adminSuspendFarmSchema = z.object({ reason: z.string().trim().max(500).optional() });

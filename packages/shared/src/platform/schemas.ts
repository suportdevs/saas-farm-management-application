import { z } from 'zod';
import { PLAN_IDS } from '../subscriptions/plans';
import { PLATFORM_PERMISSIONS } from './access';


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

/** A staff role key: a built-in one (super_admin, support…) or a custom role's slug. */
export const staffRoleKeySchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(40)
  .regex(/^[a-z0-9]+(?:[_-][a-z0-9]+)*$/, 'Use lowercase letters, numbers, dashes and underscores');

const platformPermissionList = z.array(z.enum(PLATFORM_PERMISSIONS)).max(PLATFORM_PERMISSIONS.length);
const staffRoleText = z
  .string()
  .trim()
  .max(255)
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .optional();

/** POST /admin/staff-roles — `key` defaults to a slug of the name. */
export const createPlatformRoleSchema = z.object({
  key: staffRoleKeySchema.optional(),
  name: z.string().trim().min(2, 'Use at least 2 characters').max(60),
  description: staffRoleText,
  permissions: platformPermissionList.default([]),
});
export type CreatePlatformRoleInput = z.input<typeof createPlatformRoleSchema>;

/** PATCH /admin/staff-roles/:key — the key itself never changes. */
export const updatePlatformRoleSchema = z
  .object({ name: z.string().trim().min(2).max(60), description: staffRoleText, permissions: platformPermissionList })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export type UpdatePlatformRoleInput = z.input<typeof updatePlatformRoleSchema>;

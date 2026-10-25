import { z } from 'zod';
import { CAPABILITIES } from '../subscriptions/plans';
import { planIdSchema } from '../subscriptions/schemas';
import { FARM_ROLES } from '../farms/access';
import { createFarmSchema } from '../farms/schemas';
import { PLATFORM_PERMISSIONS } from './access';


export const adminFarmListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(1000).default(20),
  q: z.string().trim().max(100).optional(),
  plan: planIdSchema.optional(),
  status: z.enum(['trialing', 'paying', 'free', 'past_due', 'suspended']).optional(),
  country: z.string().length(2).toUpperCase().optional(),
  /** Only the farms of one client organization. */
  organizationId: z.uuid().optional(),
});
export type AdminFarmListQuery = z.infer<typeof adminFarmListQuerySchema>;

export const adminSetPlanSchema = z.object({
  planId: planIdSchema,
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

// ─── Staff role import ───────────────────────────────────────────

export const STAFF_ROLE_IMPORT_LIMIT = 200;

/** One CSV row: `permissions` is a list of keys separated by spaces, commas, semicolons or pipes. */
export const staffRoleImportRowSchema = z.object({
  key: staffRoleKeySchema,
  name: z.string().trim().min(2, 'Use at least 2 characters').max(60),
  description: staffRoleText,
  permissions: z
    .string()
    .default('')
    .transform((v, ctx) => {
      const keys = v.split(/[\s,;|]+/).filter(Boolean);
      const unknown = keys.filter((k) => !(PLATFORM_PERMISSIONS as readonly string[]).includes(k));
      if (unknown.length) {
        ctx.addIssue({ code: 'custom', message: `Unknown permission ${unknown.join(', ')}` });
        return z.NEVER;
      }
      return [...new Set(keys)] as (typeof PLATFORM_PERMISSIONS)[number][];
    }),
});

/** POST /admin/staff-roles/import — all rows or none; existing custom keys are updated. */
export const staffRoleImportSchema = z.object({
  rows: z.array(staffRoleImportRowSchema).min(1, 'The file has no rows').max(STAFF_ROLE_IMPORT_LIMIT),
});
export type StaffRoleImportInput = z.input<typeof staffRoleImportSchema>;

// ─── Tenants (manual) ────────────────────────────────────────────

/** POST /admin/farms — a tenant created for a client. The owner is added now, or invited when they have no account. */
export const adminCreateFarmSchema = createFarmSchema.extend({
  ownerEmail: z.string().trim().toLowerCase().max(254).pipe(z.email('Enter a valid email address')),
  /** A new client's organization name (empty = the farm's name). Ignored when `organizationId` picks an existing one. */
  organizationName: z.string().trim().max(100).optional(),
  /** Plan to start on. Empty = the normal free trial. */
  planId: planIdSchema.optional(),
  /** Manual plans end on this date (paid-through); empty = open-ended. */
  currentPeriodEnd: z.iso.datetime({ offset: true }).nullable().optional(),
});
export type AdminCreateFarmInput = z.input<typeof adminCreateFarmSchema>;

/** Accepts numbers or numeric strings; empty → null (= use the plan's value). */
const limitValue = z
  .union([z.number(), z.string()])
  .transform((v, ctx) => {
    if (v === '' || v === null) return null;
    const n = typeof v === 'number' ? v : Number(v);
    if (!Number.isInteger(n) || n < 0 || n > 10_000_000) {
      ctx.addIssue({ code: 'custom', message: 'Enter a whole number' });
      return z.NEVER;
    }
    return n;
  })
  .nullable();

/**
 * PATCH /admin/farms/:id/entitlements — per-tenant deals on top of the plan.
 * A limit set to a number replaces the plan's; `unlimited: true` lifts it; omitted = the plan's.
 * Capabilities: true adds a module to the plan, false takes it away.
 */
export const adminEntitlementsSchema = z.object({
  limits: z
    .object({
      members: limitValue.optional(),
      animals: limitValue.optional(),
      unlimitedMembers: z.boolean().optional(),
      unlimitedAnimals: z.boolean().optional(),
    })
    .default({}),
  capabilities: z.partialRecord(z.enum(CAPABILITIES), z.boolean()).default({}),
  notes: z
    .string()
    .trim()
    .max(2000)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional(),
});
export type AdminEntitlementsInput = z.input<typeof adminEntitlementsSchema>;

// ─── Manual invoices & payments ──────────────────────────────────

export const PAYMENT_METHODS = ['bank_transfer', 'cash', 'cheque', 'card', 'mobile_money', 'other'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  bank_transfer: 'Bank transfer',
  cash: 'Cash',
  cheque: 'Cheque',
  card: 'Card (offline)',
  mobile_money: 'Mobile money',
  other: 'Other',
};

/** Money typed in major units ("1,250.50") → integer minor units (125050). */
const money = z.union([z.number(), z.string()]).transform((v, ctx) => {
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[,\s]/g, ''));
  if (!Number.isFinite(n) || n <= 0 || n > 100_000_000) {
    ctx.addIssue({ code: 'custom', message: 'Enter an amount greater than 0' });
    return z.NEVER;
  }
  return Math.round(n * 100);
});

const isoDate = z.iso.date('Enter a date (YYYY-MM-DD)');

/** POST /admin/farms/:id/invoices */
export const manualInvoiceSchema = z.object({
  description: z.string().trim().min(2, 'Describe what the invoice is for').max(255),
  amount: money,
  currency: z.string().trim().toUpperCase().length(3, 'Use a 3-letter currency code'),
  issuedAt: isoDate.optional(),
  dueAt: isoDate,
  /** When paid in full, the tenant moves to this plan… */
  planId: planIdSchema.nullable().optional(),
  /** …paid through this date. */
  periodEnd: isoDate.nullable().optional(),
  notes: z.string().trim().max(2000).optional(),
});
export type ManualInvoiceInput = z.input<typeof manualInvoiceSchema>;

/** POST /admin/farms/:id/invoices/:invoiceId/payments */
export const manualPaymentSchema = z.object({
  amount: money,
  method: z.enum(PAYMENT_METHODS),
  reference: z.string().trim().max(120).optional(),
  paidAt: isoDate.optional(),
  notes: z.string().trim().max(1000).optional(),
});
export type ManualPaymentInput = z.input<typeof manualPaymentSchema>;

export const INVOICE_STATUSES = ['open', 'overdue', 'paid', 'void'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

/** GET /admin/farms/subscriptions */
export const adminSubscriptionListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(1000).default(25),
  q: z.string().trim().max(100).optional(),
  plan: planIdSchema.optional(),
  state: z.enum(['free', 'trialing', 'active', 'past_due', 'canceled']).optional(),
  source: z.enum(['stripe', 'manual', 'none']).optional(),
  /** Tenants with unpaid / overdue manual invoices. */
  billing: z.enum(['unpaid', 'overdue']).optional(),
});
export type AdminSubscriptionListQuery = z.infer<typeof adminSubscriptionListQuerySchema>;

/** GET /admin/farms/invoices */
export const adminInvoiceListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(1000).default(25),
  q: z.string().trim().max(100).optional(),
  status: z.enum(INVOICE_STATUSES).optional(),
});
export type AdminInvoiceListQuery = z.infer<typeof adminInvoiceListQuerySchema>;

// ─── Client accounts & teams (platform-managed) ──────────────────

/** Admin → Users: create an account for a client. They set their password from the emailed link. */
export const adminCreateUserSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(100),
  email: z.string().trim().toLowerCase().max(254).pipe(z.email('Enter a valid email address')),
});
export type AdminCreateUserInput = z.input<typeof adminCreateUserSchema>;

/** Admin → a tenant → Team: add someone (an existing account joins now, anyone else is invited). */
export const adminAddMemberSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email('Enter a valid email address')),
  role: z.enum(FARM_ROLES).default('worker'),
});
export const adminUpdateMemberSchema = z.object({ role: z.enum(FARM_ROLES) });

/** Makes a member the farm's owner; the previous owners stay on as managers unless `keepOwners`. */
export const adminTransferOwnershipSchema = z.object({
  userId: z.uuid(),
  keepOwners: z.boolean().default(false),
});

export const adminOrganizationListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(1000).default(20),
  q: z.string().trim().max(100).optional(),
});
export type AdminOrganizationListQuery = z.infer<typeof adminOrganizationListQuerySchema>;

/** Moves a farm to another client organization (e.g. the farm was sold). */
export const adminMoveFarmSchema = z.object({ organizationId: z.uuid() });

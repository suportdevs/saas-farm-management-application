import { z } from 'zod';
import { CAPABILITIES } from './plans';

/** A plan code: lowercase letters, digits, - and _ (fits the 20-character plan columns). */
export const planIdSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z][a-z0-9_-]{1,19}$/, 'Use 2–20 lowercase letters, digits, - or _ (starting with a letter)');

/** Self-serve checkout: any plan the platform sells online. */
export const checkoutSchema = z.object({
  planId: planIdSchema,
  interval: z.enum(['month', 'year']).default('month'),
});

/** Price in cents; empty = no price for that interval. */
const price = z
  .union([z.number(), z.string(), z.null()])
  .transform((v, ctx) => {
    if (v === '' || v === null) return null;
    const n = typeof v === 'number' ? v : Number(v);
    if (!Number.isInteger(n) || n < 0 || n > 100_000_000) {
      ctx.addIssue({ code: 'custom', message: 'Enter a price in cents (whole number)' });
      return z.NEVER;
    }
    return n;
  });

/** A plan limit; empty = unlimited. */
const limit = z
  .union([z.number(), z.string(), z.null()])
  .transform((v, ctx) => {
    if (v === '' || v === null) return null;
    const n = typeof v === 'number' ? v : Number(v);
    if (!Number.isInteger(n) || n < 0 || n > 10_000_000) {
      ctx.addIssue({ code: 'custom', message: 'Enter a whole number, or leave empty for unlimited' });
      return z.NEVER;
    }
    return n;
  });

const stripePriceId = z
  .string()
  .trim()
  .max(100)
  .transform((v) => (v === '' ? null : v))
  .nullable();

/** Plan fields without defaults, so a partial update only touches what was sent. */
const planFields = {
  name: z.string().trim().min(2, 'Enter a name').max(60),
  tagline: z.string().trim().max(160),
  prices: z.object({ month: price.optional(), year: price.optional() }),
  custom: z.boolean(),
  highlighted: z.boolean(),
  isPublic: z.boolean(),
  selfServe: z.boolean(),
  limits: z.object({ animals: limit, members: limit }),
  capabilities: z.array(z.enum(CAPABILITIES)),
  features: z.array(z.string().trim().min(1).max(120)).max(20),
  stripePrices: z.object({ month: stripePriceId.optional(), year: stripePriceId.optional() }),
  sortOrder: z.coerce.number().int().min(0).max(1000),
};

/** Admin → Plans: create. */
export const createPlanSchema = z.object({
  id: planIdSchema,
  ...planFields,
  tagline: planFields.tagline.default(''),
  prices: planFields.prices.default({}),
  custom: planFields.custom.default(false),
  highlighted: planFields.highlighted.default(false),
  isPublic: planFields.isPublic.default(true),
  selfServe: planFields.selfServe.default(false),
  capabilities: planFields.capabilities.default([]),
  features: planFields.features.default([]),
  stripePrices: planFields.stripePrices.default({}),
  sortOrder: planFields.sortOrder.default(0),
});
export type CreatePlanInput = z.input<typeof createPlanSchema>;
export type CreatePlanData = z.output<typeof createPlanSchema>;

/** Admin → Plans: update (the code can't change). */
export const updatePlanSchema = z.object(planFields).partial();
export type UpdatePlanInput = z.input<typeof updatePlanSchema>;
export type UpdatePlanData = z.output<typeof updatePlanSchema>;

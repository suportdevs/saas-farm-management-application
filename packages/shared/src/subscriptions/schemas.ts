import { z } from 'zod';

/** Self-serve checkout: only plans sold online. */
export const checkoutSchema = z.object({
  planId: z.enum(['growth', 'pro']),
  interval: z.enum(['month', 'year']).default('month'),
});

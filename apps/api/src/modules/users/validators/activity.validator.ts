import { z } from 'zod';

export const activityQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export type ActivityQuery = z.infer<typeof activityQuery>;

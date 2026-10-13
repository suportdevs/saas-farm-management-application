import { z } from 'zod';

export const adminUserListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(100).optional(),
  role: z.enum(['user', 'admin']).optional(),
  status: z.enum(['active', 'banned', 'unverified']).optional(),
});
export type AdminUserListQuery = z.infer<typeof adminUserListQuerySchema>;

export const adminUpdateUserSchema = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100).optional(),
    role: z.enum(['user', 'admin']).optional(),
    emailVerified: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export type AdminUpdateUserInput = z.infer<typeof adminUpdateUserSchema>;

export const banUserSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});
export type BanUserInput = z.infer<typeof banUserSchema>;

export const auditLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  userId: z.uuid().optional(),
  action: z.string().trim().max(100).optional(),
});
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;

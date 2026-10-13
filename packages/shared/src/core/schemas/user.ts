import { z } from 'zod';
import { emailSchema, passwordSchema } from './auth';

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const changePasswordSchema = z.object({
  // Optional: users created via social login may not have a password yet.
  currentPassword: z.string().max(128).optional(),
  newPassword: passwordSchema,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const deleteAccountSchema = z.object({
  password: z.string().max(128).optional(),
});
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;

export const changeEmailSchema = z.object({
  newEmail: emailSchema,
  // Optional: users created via social login may not have a password.
  password: z.string().max(128).optional(),
});
export type ChangeEmailInput = z.infer<typeof changeEmailSchema>;

export const confirmEmailChangeSchema = z.object({ token: z.string().min(1) });
export type ConfirmEmailChangeInput = z.infer<typeof confirmEmailChangeSchema>;

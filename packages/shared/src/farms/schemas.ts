import { z } from 'zod';
import { FARM_ROLES, PERMISSIONS, type Permission } from './access';
import { AREA_UNITS, COUNTRY_CODES, isValidCurrency, isValidLocale, isValidTimeZone, MILK_UNITS, UNIT_SYSTEMS, WEIGHT_UNITS } from './geo';

export const FARM_TYPES = ['dairy', 'beef', 'mixed', 'breeding', 'calf_rearing'] as const;
export type FarmType = (typeof FARM_TYPES)[number];

export const FARM_TYPE_INFO: Record<FarmType, { label: string; description: string }> = {
  dairy: { label: 'Dairy', description: 'Milk production herd' },
  beef: { label: 'Beef', description: 'Cow-calf, backgrounding or finishing' },
  mixed: { label: 'Mixed', description: 'Dairy and beef enterprises' },
  breeding: { label: 'Breeding / Stud', description: 'Genetics, heifers and bulls' },
  calf_rearing: { label: 'Calf rearing', description: 'Raising calves and youngstock' },
};

/** Empty strings from forms become null, so a field can be cleared. */
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional();

/** Accepts numbers or numeric strings; empty → null. */
const amount = (max: number) =>
  z
    .union([z.number(), z.string()])
    .transform((v, ctx) => {
      if (v === '' || v === null) return null;
      const n = typeof v === 'number' ? v : Number(v);
      if (!Number.isFinite(n) || n < 0 || n > max) {
        ctx.addIssue({ code: 'custom', message: `Enter a number between 0 and ${max.toLocaleString('en')}` });
        return z.NEVER;
      }
      return n;
    })
    .nullable()
    .optional();

export const farmNameSchema = z.string().trim().min(2, 'Farm name must be at least 2 characters').max(100);

export const farmSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Use at least 3 characters')
  .max(48)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and dashes');

const localisation = {
  country: z.enum(COUNTRY_CODES as [string, ...string[]], 'Choose a country'),
  timezone: z.string().refine(isValidTimeZone, 'Choose a valid time zone'),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .refine(isValidCurrency, 'Choose a valid currency'),
  locale: z.string().max(35).refine(isValidLocale, 'Choose a valid language'),
  unitSystem: z.enum(UNIT_SYSTEMS),
  milkUnit: z.enum(MILK_UNITS),
  weightUnit: z.enum(WEIGHT_UNITS),
  areaUnit: z.enum(AREA_UNITS),
};

export const createFarmSchema = z.object({
  name: farmNameSchema,
  type: z.enum(FARM_TYPES),
  ...localisation,
  locale: localisation.locale.default('en-US'),
  region: text(100),
  city: text(100),
  totalArea: amount(10_000_000),
  herdSize: amount(1_000_000),
  goals: z.array(z.string().max(50)).max(12).default([]),
});
export type CreateFarmInput = z.input<typeof createFarmSchema>;
export type CreateFarmData = z.output<typeof createFarmSchema>;

export const updateFarmSchema = z
  .object({
    name: farmNameSchema,
    slug: farmSlugSchema,
    type: z.enum(FARM_TYPES),
    description: text(1000),
    ...localisation,
    region: text(100),
    city: text(100),
    address: text(255),
    postalCode: text(20),
    phone: text(40),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(254)
      .refine((v) => v === '' || z.email().safeParse(v).success, 'Enter a valid email address')
      .transform((v) => (v === '' ? null : v))
      .nullable()
      .optional(),
    website: text(255),
    registrationNumber: text(100),
    taxId: text(100),
    totalArea: amount(10_000_000),
    herdSize: amount(1_000_000),
    fiscalYearStartMonth: z.coerce.number().int().min(1).max(12),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export type UpdateFarmInput = z.input<typeof updateFarmSchema>;
export type UpdateFarmData = z.output<typeof updateFarmSchema>;

export const farmRoleSchema = z.enum(FARM_ROLES);

export const inviteMemberSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email('Enter a valid email address')),
  role: farmRoleSchema.default('worker'),
  title: text(80),
});
export type InviteMemberInput = z.input<typeof inviteMemberSchema>;

export const updateMemberSchema = z
  .object({ role: farmRoleSchema, title: text(80) })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export type UpdateMemberInput = z.input<typeof updateMemberSchema>;

export const deleteFarmSchema = z.object({ confirm: z.string().trim().min(1, 'Type the farm name to confirm') });

export const invitationTokenSchema = z.object({ token: z.string().min(1).max(200) });

export const permissionSchema = z.enum(PERMISSIONS as [Permission, ...Permission[]]);

/** PUT /farms/:farm/roles/:role/permissions — the full set of keys the role should hold. */
export const rolePermissionsSchema = z.object({
  permissions: z.array(permissionSchema).max(PERMISSIONS.length),
});
export type RolePermissionsInput = z.input<typeof rolePermissionsSchema>;

/** PUT /farms/:farm/members/:userId/permissions — allow (true) / deny (false) per key; omitted keys inherit the role. */
export const memberPermissionsSchema = z.object({
  overrides: z.partialRecord(permissionSchema, z.boolean()),
});
export type MemberPermissionsInput = z.input<typeof memberPermissionsSchema>;

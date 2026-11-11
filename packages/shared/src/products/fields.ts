import { z } from 'zod';
import { STATUS, type CatalogChoice } from './catalog';

/**
 * Field validators shared by every catalog's create/update body (products,
 * herd…). The same rules check the modal form and each CSV import row.
 */

export const required = (label: string, max: number) => z.string(`${label} is required`).trim().min(1, `${label} is required`).max(max);

/** Empty strings (forms, CSV cells) become null. */
export const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);

/** A required reference: the referenced row's key. */
export const ref = (message: string) => z.uuid(message);
/** An optional reference: key, or empty/null for none. */
export const optionalRef = z
  .union([z.uuid('Choose a valid option'), z.literal('')])
  .nullish()
  .transform((v) => v || null);

/** Accepts numbers or numeric strings; empty → null, or an error when `required` (a label) is set. */
export const decimal = (max: number, required?: string, opts: { whole?: boolean } = {}) =>
  z
    .union([z.number(), z.string().trim()])
    .nullish()
    .transform((v, ctx) => {
      if (v === '' || v == null) {
        if (!required) return null;
        ctx.addIssue({ code: 'custom', message: `${required} is required` });
        return z.NEVER;
      }
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > max) {
        ctx.addIssue({ code: 'custom', message: `Enter a number between 0 and ${max.toLocaleString('en')}` });
        return z.NEVER;
      }
      if (opts.whole && !Number.isInteger(n)) {
        ctx.addIssue({ code: 'custom', message: 'Enter a whole number' });
        return z.NEVER;
      }
      return n;
    });

/** 1/0, "1"/"0" or "active"/"inactive" (any case); missing → active. */
export const status = z
  .union([z.number(), z.string().trim().toLowerCase()])
  .nullish()
  .transform((v, ctx) => {
    if (v === '' || v == null) return STATUS.active;
    if (v === 1 || v === '1' || v === 'active') return STATUS.active;
    if (v === 0 || v === '0' || v === 'inactive') return STATUS.inactive;
    ctx.addIssue({ code: 'custom', message: 'Use Active or Inactive' });
    return z.NEVER;
  });

/** A required day as YYYY-MM-DD. */
export const requiredDate = (label: string) => z.iso.date(`${label} is required (YYYY-MM-DD)`);

/** An optional day as YYYY-MM-DD; empty → null. */
export const optionalDate = z
  .union([z.iso.date('Use YYYY-MM-DD'), z.literal('')])
  .nullish()
  .transform((v) => v || null);

/**
 * One of a select's choices. Accepts the stored value or the label, any case
 * (so exported files import again); empty → `fallback`, null, or an error when required.
 */
export const choice = <const T extends readonly CatalogChoice[]>(options: T, label: string, opts: { required?: boolean; fallback?: T[number]['value'] } = {}) =>
  z
    .string()
    .trim()
    .nullish()
    .transform((v, ctx): T[number]['value'] | null => {
      if (!v) {
        if (opts.fallback) return opts.fallback;
        if (!opts.required) return null;
        ctx.addIssue({ code: 'custom', message: `${label} is required` });
        return z.NEVER;
      }
      const wanted = v.toLowerCase();
      const match = options.find((o) => o.value === wanted || o.label.toLowerCase() === wanted);
      if (!match) {
        ctx.addIssue({ code: 'custom', message: `Use one of: ${options.map((o) => o.label).join(', ')}` });
        return z.NEVER;
      }
      return match.value;
    });

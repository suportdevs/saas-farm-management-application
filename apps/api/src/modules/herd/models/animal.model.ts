import { date, index, integer, numeric, pgTable, text, varchar, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { activeUnique, audit, base } from '../../products/models/columns';
import { pens } from './pen.model';

// NOTE: keep imports in model files relative — drizzle-kit loads them directly.

/** The herd register: one row per animal. Choices (sex, type…) are listed in shared herd/catalog.ts. */
export const animals = pgTable(
  'animals',
  {
    ...base(),
    /** Ear tag — the animal's identity on the farm. */
    tag: varchar('tag', { length: 50 }).notNull(),
    name: varchar('name', { length: 100 }),
    /** female · male */
    sex: varchar('sex', { length: 10 }).notNull(),
    /** cow · heifer · calf · bull · steer */
    type: varchar('type', { length: 10 }),
    breed: varchar('breed', { length: 100 }),
    penId: integer('pen_id').references(() => pens.id),
    birthDate: date('birth_date', { mode: 'string' }),
    /** born · purchased */
    origin: varchar('origin', { length: 10 }).notNull().default('born'),
    purchaseDate: date('purchase_date', { mode: 'string' }),
    motherId: integer('mother_id').references((): AnyPgColumn => animals.id),
    fatherId: integer('father_id').references((): AnyPgColumn => animals.id),
    weight: numeric('weight', { precision: 8, scale: 2, mode: 'number' }),
    /** in_herd · sold · dead — only in_herd animals count toward the plan limit. */
    herdStatus: varchar('herd_status', { length: 10 }).notNull().default('in_herd'),
    notes: text('notes'),
    /** Photo file name under animals/<tenant_id>/ in storage. */
    image: varchar('image', { length: 100 }),
    ...audit(),
  },
  (t) => [
    activeUnique('animals_tag_uq', t.tenantId, t.tag),
    index('animals_pen_idx').on(t.penId),
    index('animals_mother_idx').on(t.motherId),
    index('animals_father_idx').on(t.fatherId),
    index('animals_herd_status_idx').on(t.tenantId, t.herdStatus),
  ],
);

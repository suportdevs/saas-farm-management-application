import { isNull } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { currentUserId } from './schema';

/**
 * Soft delete (project rule: data is never removed).
 *
 *   delete:   db.update(farms).set(softDeleted()).where(eq(farms.id, id))
 *   read:     db.select().from(farms).where(and(eq(farms.slug, slug), notDeleted(farms)))
 *   re-add:   .onConflictDoUpdate({ target: …, set: { ...values, ...revived } })
 *
 * Tables keyed by their natural key (farm_members, organization_members,
 * farm_role_permissions, plans) bring a deleted row back instead of inserting a new one.
 */

/** Where-condition: the row is not deleted. */
export const notDeleted = (table: { deletedAt: AnyPgColumn }) => isNull(table.deletedAt);

/** Values that mark a row deleted, by the signed-in user of the current request. */
export const softDeleted = () => ({ deletedAt: new Date(), deletedBy: currentUserId() });

/** Values that bring a deleted row back. */
export const revived = () => ({ deletedAt: null, deletedBy: null });

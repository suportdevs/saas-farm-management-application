import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { FARM_ROLES, type FarmPermissions, type FarmRole } from '@kit/shared';
import { RolePermissionsEditor, type RoleTarget } from '@/modules/farms/components/role-permissions-editor';
import { getFarmContext } from '@/modules/farms/server';
import { serverFetch } from '@/lib/session';

export const metadata: Metadata = { title: 'Give permission' };

/** /farms/<farm>/roles/<role>/permissions — <role> is a built-in role key or a custom role id. */
export default async function RolePermissionsPage({ params }: { params: Promise<{ farm: string; role: string }> }) {
  const { farm: slug, role } = await params;
  const ctx = await getFarmContext(slug);
  if (!ctx.membership.permissions.includes('roles.view')) notFound();
  const permissions = await serverFetch<FarmPermissions>(`/farms/${slug}/permissions`);
  if (!permissions) notFound();

  let target: RoleTarget;
  if ((FARM_ROLES as readonly string[]).includes(role)) {
    // Owners always have everything: there is nothing to give.
    if (role === 'owner') notFound();
    target = { kind: 'system', role: role as Exclude<FarmRole, 'owner'> };
  } else {
    if (!permissions.customRoles.some((r) => r.id === role)) notFound();
    target = { kind: 'custom', id: role };
  }
  return <RolePermissionsEditor initial={permissions} target={target} />;
}

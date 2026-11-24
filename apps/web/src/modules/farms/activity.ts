import { CATALOG, isCatalogResource, planName, ROLE_INFO, type FarmActivityEntry, type FarmRole, type PublicPlan } from '@kit/shared';

/** The extra line under an activity entry (who was invited, what changed…). Shared by the Activity page and its download. */
export function activityDetail(e: FarmActivityEntry, plans: PublicPlan[]): string | null {
  const m = e.metadata;
  if (e.action === 'farm.member_invited' && typeof m.email === 'string') return `${m.email} as ${typeof m.roleLabel === 'string' ? m.roleLabel : (ROLE_INFO[m.role as FarmRole]?.label ?? m.role)}`;
  if (e.action === 'farm.member_role_changed' && typeof m.to === 'string') return `${ROLE_INFO[m.from as FarmRole]?.label ?? m.from} → ${ROLE_INFO[m.to as FarmRole]?.label ?? m.to}`;
  if (e.action === 'farm.invitation_revoked' && typeof m.email === 'string') return m.email;
  if (e.action === 'farm.updated' && Array.isArray(m.fields)) return `Changed ${m.fields.join(', ')}`;
  if (e.action.startsWith('farm.role_permissions_') && Array.isArray(m.changed)) return `${ROLE_INFO[m.role as FarmRole]?.label ?? m.role} · ${m.changed.join(', ')}`;
  if (e.action === 'farm.member_permissions_changed' && Array.isArray(m.changed)) return m.changed.join(', ');
  if (e.action.startsWith('farm.role_') && typeof m.name === 'string') return typeof m.from === 'string' ? `${m.from} → ${m.name}` : m.name;
  if (e.action === 'farm.subscription_changed' && typeof m.to === 'string' && typeof m.from === 'string') {
    return m.from === m.to ? `${planName(plans, m.to)} · ${m.fromState} → ${m.toState}` : `${planName(plans, m.from)} → ${planName(plans, m.to)}`;
  }
  if (e.action.startsWith('farm.payment_') && typeof m.amount === 'string') return m.amount;
  if (e.action === 'admin.farm.plan_changed' && typeof m.to === 'string') return `${m.from} → ${m.to}`;
  if (e.action === 'admin.farm.suspended' && typeof m.reason === 'string') return m.reason;
  if (isCatalogResource(m.resource) && e.action.startsWith(`${CATALOG[m.resource].module}.`)) {
    const what = typeof m.name === 'string' ? m.name : `${m.count} ${m.count === 1 ? 'row' : 'rows'}`;
    return `${CATALOG[m.resource].label} · ${what}`;
  }
  if (e.action.startsWith('feed.') && typeof m.name === 'string') return typeof m.count === 'number' ? `${m.name} · ${m.count} ${m.count === 1 ? 'line' : 'lines'}` : m.name;
  if (e.action.startsWith('purchase.') && typeof m.name === 'string') return typeof m.count === 'number' ? `${m.name} · ${m.count} ${m.count === 1 ? 'animal' : 'animals'}` : m.name;
  return null;
}

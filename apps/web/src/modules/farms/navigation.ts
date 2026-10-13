import type { ComponentType } from 'react';
import {
  ChartColumn,
  ClipboardCheck,
  CreditCard,
  Dna,
  History,
  LayoutDashboard,
  Milk,
  Settings,
  Stethoscope,
  Users,
  Wallet,
  Wheat,
} from 'lucide-react';
import type { Capability, Permission } from '@kit/shared';
import { CowMark } from '@/components/logo';

type Icon = ComponentType<{ className?: string }>;

export interface FarmModule {
  /** URL segment under /farms/[farm]/. */
  slug: string;
  label: string;
  icon: Icon;
  summary: string;
  /** Plan capability needed to use it. */
  capability?: Capability;
  status: 'live' | 'soon';
  highlights: string[];
}

/**
 * Operation modules. Phase 2 builds these one by one: add the page under
 * app/(app)/farms/[farm]/<slug>/ and flip `status` to "live".
 */
export const OPERATION_MODULES: FarmModule[] = [
  {
    slug: 'herd',
    label: 'Herd',
    icon: CowMark,
    capability: 'herd',
    status: 'soon',
    summary: 'A complete register of every animal — identity, lineage, groups, movements and lifetime history.',
    highlights: ['Ear tag, RFID and national ID tracking', 'Pedigree and family trees', 'Groups, pens and paddocks', 'Purchases, sales and deaths', 'Bulk import from spreadsheets'],
  },
  {
    slug: 'milk',
    label: 'Milk',
    icon: Milk,
    capability: 'milk',
    status: 'soon',
    summary: 'Record yields per cow or per session and spot problems before they cost you.',
    highlights: ['Per-cow and bulk-tank recording', 'Lactation curves and 305-day yields', 'Fat, protein and SCC', 'Withdrawal-period alerts', 'Milk sales and collections'],
  },
  {
    slug: 'health',
    label: 'Health',
    icon: Stethoscope,
    capability: 'health',
    status: 'soon',
    summary: 'Treatments, vaccinations and vet visits with withdrawal periods tracked automatically.',
    highlights: ['Treatment and vaccination plans', 'Medicine stock and batch numbers', 'Withdrawal tracking for milk and meat', 'Body condition and lameness scores', 'Vet visit notes'],
  },
  {
    slug: 'breeding',
    label: 'Breeding',
    icon: Dna,
    capability: 'breeding',
    status: 'soon',
    summary: 'Heats, inseminations, pregnancy checks and calvings — with a breeding calendar.',
    highlights: ['Heat detection and AI records', 'Sire and semen inventory', 'Pregnancy diagnosis', 'Expected calving calendar', 'Fertility KPIs'],
  },
  {
    slug: 'feed',
    label: 'Feed',
    icon: Wheat,
    capability: 'feed',
    status: 'soon',
    summary: 'Rations, feeding records and feed stock so you always know cost per animal.',
    highlights: ['Rations and feeding groups', 'Feed and forage inventory', 'Cost per animal and per litre', 'Low-stock alerts', 'Supplier purchases'],
  },
  {
    slug: 'tasks',
    label: 'Tasks',
    icon: ClipboardCheck,
    status: 'soon',
    summary: 'Plan the daily work, assign it to the team and see what got done.',
    highlights: ['Recurring daily routines', 'Assign to team members', 'Due-today reminders', 'Protocol checklists', 'Mobile-friendly checklists'],
  },
];

export const BUSINESS_MODULES: FarmModule[] = [
  {
    slug: 'finance',
    label: 'Finance',
    icon: Wallet,
    capability: 'finance',
    status: 'soon',
    summary: 'Income, expenses and profitability per enterprise — in your own currency.',
    highlights: ['Income and expense ledger', 'Milk and cattle sales', 'Budgets by fiscal year', 'Profit per animal', 'Accountant-ready exports'],
  },
  {
    slug: 'reports',
    label: 'Reports',
    icon: ChartColumn,
    capability: 'advanced_reports',
    status: 'soon',
    summary: 'Dashboards and benchmarks across production, health, fertility and finance.',
    highlights: ['Production and fertility KPIs', 'Herd health trends', 'Cost and margin analysis', 'Scheduled email reports', 'PDF and Excel exports'],
  },
];

export const ALL_MODULES = [...OPERATION_MODULES, ...BUSINESS_MODULES];
export const findModule = (slug: string) => ALL_MODULES.find((m) => m.slug === slug);

export interface NavLink {
  href: string;
  label: string;
  icon: Icon;
  permission?: Permission;
  soon?: boolean;
  exact?: boolean;
}

export interface NavSection {
  title?: string;
  links: NavLink[];
}

export function farmNav(slug: string): NavSection[] {
  const base = `/farms/${slug}`;
  const toLink = (m: FarmModule): NavLink => ({ href: `${base}/${m.slug}`, label: m.label, icon: m.icon, soon: m.status === 'soon' });
  return [
    { links: [{ href: base, label: 'Overview', icon: LayoutDashboard, exact: true }] },
    { title: 'Operations', links: OPERATION_MODULES.map(toLink) },
    { title: 'Business', links: BUSINESS_MODULES.map(toLink) },
    {
      title: 'Farm',
      links: [
        { href: `${base}/team`, label: 'Team', icon: Users },
        { href: `${base}/activity`, label: 'Activity', icon: History, permission: 'activity.view' },
        { href: `${base}/billing`, label: 'Plan & billing', icon: CreditCard, permission: 'billing.view' },
        { href: `${base}/settings`, label: 'Farm settings', icon: Settings, permission: 'farm.update' },
      ],
    },
  ];
}

/** Friendly labels for farm activity entries. */
export const ACTIVITY_LABELS: Record<string, string> = {
  'farm.created': 'created the farm',
  'farm.updated': 'updated farm settings',
  'farm.member_invited': 'invited a team member',
  'farm.member_joined': 'joined the farm',
  'farm.member_left': 'left the farm',
  'farm.member_removed': 'removed a team member',
  'farm.member_role_changed': "changed a member's role",
  'farm.invitation_revoked': 'revoked an invitation',
  'farm.checkout_started': 'started a plan upgrade',
  'admin.farm.plan_changed': 'changed the plan (support)',
  'admin.farm.trial_extended': 'extended the trial (support)',
  'admin.farm.suspended': 'suspended the farm (support)',
  'admin.farm.unsuspended': 'restored the farm (support)',
};

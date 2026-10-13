import type { ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { PublicUser } from '@kit/shared';

export interface NavItem {
  href: string;
  label: string;
  icon?: LucideIcon;
}

/**
 * Contract between the web app and an installed module. The app renders
 * these contributions at fixed "slots", so modules never edit core pages.
 */
export interface WebModule {
  name: string;
  /** Rendered under the login / register forms (e.g. "Continue with Google"). */
  authProviders?: ComponentType<{ mode: 'login' | 'register' }>[];
  /** Cards rendered on Settings → Security. */
  securitySections?: ComponentType<{ user: PublicUser }>[];
  /** Maps an API challenge (returned by login) to the page that resolves it. */
  challenges?: Record<string, string>;
  /** Extra items in the app sidebar. */
  navItems?: NavItem[];
  /** Extra tabs under Settings (the module ships the page at `href`). */
  settingsTabs?: { href: string; label: string }[];
  /** Links in the public marketing header/footer (e.g. "Pricing"). */
  publicNavItems?: { href: string; label: string }[];
  /** Cards rendered on the dashboard below the stats. */
  dashboardWidgets?: ComponentType<{ user: PublicUser }>[];
}

export const defineWebModule = (mod: WebModule): WebModule => mod;

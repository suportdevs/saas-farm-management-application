export const AUTH_LAYOUTS = [
  'centered',
  'split-left',
  'split-right',
  'fullscreen',
  'card',
  'youtube-video',
  'animated-birds',
  'aurora-waves',
  'particle-network',
  'tidal',
] as const;

export type AuthLayout = (typeof AUTH_LAYOUTS)[number];

export const AUTH_LAYOUT_COOKIE = 'auth_layout';

export const isAuthLayout = (v: unknown): v is AuthLayout => AUTH_LAYOUTS.includes(v as AuthLayout);

/** The configured default (NEXT_PUBLIC_AUTH_LAYOUT), falling back to "centered". */
export const defaultAuthLayout: AuthLayout = isAuthLayout(process.env.NEXT_PUBLIC_AUTH_LAYOUT)
  ? process.env.NEXT_PUBLIC_AUTH_LAYOUT
  : 'centered';

/** Show the floating layout picker (on by default in development). */
export const layoutSwitcherEnabled =
  process.env.NEXT_PUBLIC_AUTH_LAYOUT_SWITCHER === 'true' ||
  (process.env.NEXT_PUBLIC_AUTH_LAYOUT_SWITCHER !== 'false' && process.env.NODE_ENV !== 'production');

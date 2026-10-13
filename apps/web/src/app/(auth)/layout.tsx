import { cookies } from 'next/headers';
import { AuthShell } from '@/components/auth-layouts/auth-shell';
import { LayoutSwitcher } from '@/components/auth-layouts/layout-switcher';
import { AUTH_LAYOUT_COOKIE, defaultAuthLayout, isAuthLayout, layoutSwitcherEnabled } from '@/components/auth-layouts/layouts';

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  // The cookie (set by the preview switcher) only applies while the switcher is enabled.
  const picked = layoutSwitcherEnabled ? (await cookies()).get(AUTH_LAYOUT_COOKIE)?.value : undefined;
  const layout = isAuthLayout(picked) ? picked : defaultAuthLayout;
  return (
    <>
      <AuthShell layout={layout} youtubeId={process.env.NEXT_PUBLIC_AUTH_YOUTUBE_ID || undefined}>
        {children}
      </AuthShell>
      {layoutSwitcherEnabled && <LayoutSwitcher current={layout} />}
    </>
  );
}

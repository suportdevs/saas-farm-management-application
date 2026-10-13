import type { ReactNode } from 'react';
import { Logo } from '@/components/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { cn } from '@/lib/utils';
import { AnimatedBirds, AuroraWaves, GradientMesh, ParticleNetwork, Tidal, YouTubeBackground } from './backgrounds';
import { BrandPanel } from './brand-panel';
import type { AuthLayout } from './layouts';

function TopBar({ className }: { className?: string }) {
  return (
    <header className={cn('relative z-10 flex items-center justify-between px-6 py-5', className)}>
      <Logo />
      <ThemeToggle />
    </header>
  );
}

/** Frosted panel that keeps forms readable over busy backgrounds. */
function Glass({ children }: { children: ReactNode }) {
  return (
    <div className="auth-flat w-full max-w-sm rounded-3xl bg-background/75 p-6 shadow-2xl ring-1 ring-black/5 backdrop-blur-xl dark:ring-white/10 sm:p-8">
      {children}
    </div>
  );
}

/** Immersive layouts: animated/visual background with the form in a glass card. */
function Immersive({ background, children }: { background: ReactNode; children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      {background}
      <TopBar />
      <main className="relative z-10 flex flex-1 items-center justify-center px-4 pb-16">
        <Glass>{children}</Glass>
      </main>
    </div>
  );
}

function Split({ formSide, children }: { formSide: 'left' | 'right'; children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className={cn('flex flex-col', formSide === 'right' && 'lg:order-2')}>
        <TopBar />
        <main className="flex flex-1 items-center justify-center px-4 pb-16">
          <div className="w-full max-w-sm">{children}</div>
        </main>
      </div>
      <BrandPanel className="hidden lg:flex" />
    </div>
  );
}

/**
 * Wraps every auth page (sign in, sign up, reset…) in the configured layout.
 * Pages render the same AuthCard in all of them.
 */
export function AuthShell({ layout, youtubeId, children }: { layout: AuthLayout; youtubeId?: string; children: ReactNode }) {
  switch (layout) {
    case 'split-left':
      return <Split formSide="left">{children}</Split>;
    case 'split-right':
      return <Split formSide="right">{children}</Split>;
    case 'card':
      return (
        <div className="flex min-h-screen flex-col bg-muted/50">
          <TopBar />
          <main className="flex flex-1 items-center justify-center px-4 pb-16">
            <div className="grid w-full max-w-4xl overflow-hidden rounded-3xl border bg-card shadow-xl md:grid-cols-2">
              <BrandPanel className="hidden md:flex" />
              <div className="auth-flat flex items-center justify-center p-8 sm:p-10">
                <div className="w-full max-w-sm">{children}</div>
              </div>
            </div>
          </main>
        </div>
      );
    case 'fullscreen':
      return <Immersive background={<GradientMesh />}>{children}</Immersive>;
    case 'youtube-video':
      return (
        <div className={youtubeId ? 'dark' : undefined}>
          <Immersive background={<YouTubeBackground videoId={youtubeId} />}>{children}</Immersive>
        </div>
      );
    case 'animated-birds':
      return <Immersive background={<AnimatedBirds />}>{children}</Immersive>;
    case 'aurora-waves':
      return <Immersive background={<AuroraWaves />}>{children}</Immersive>;
    case 'particle-network':
      return <Immersive background={<ParticleNetwork />}>{children}</Immersive>;
    case 'tidal':
      return <Immersive background={<Tidal />}>{children}</Immersive>;
    case 'centered':
    default:
      return (
        <div className="relative flex min-h-screen flex-col">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-primary/10 to-transparent" aria-hidden />
          <TopBar />
          <main className="relative flex flex-1 items-center justify-center px-4 pb-16">
            <div className="w-full max-w-sm">{children}</div>
          </main>
        </div>
      );
  }
}

'use client';

import { useEffect, useState } from 'react';
import { Maximize, Minimize, Monitor, Moon, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Settings2, Sun, ZoomIn, ZoomOut } from 'lucide-react';
import { Logo } from '@/components/logo';
import { Menu, menuItemClasses } from '@/components/ui/menu';
import { ZOOM_LEVELS, type ThemeMode } from '@/lib/preferences';
import { cn } from '@/lib/utils';
import { AccountMenu, type ShellProps } from './app-sidebar';
import { MobileNav } from './mobile-nav';
import { usePreferences } from './preferences-provider';
import { SettingsPanel } from './settings-panel';

const iconButton = 'flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground';

/** The sticky top bar of the app: menu toggles on the left, view controls and the account on the right. */
export function AppBar({ user, farms }: ShellProps) {
  const { prefs, setPref } = usePreferences();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const sideNav = prefs.nav === 'left' || prefs.nav === 'right';

  const CollapseIcon = prefs.nav === 'right' ? (prefs.collapsed ? PanelRightOpen : PanelRightClose) : prefs.collapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-1 border-b bg-background/80 px-3 backdrop-blur-md sm:px-4">
      {/* Phones and tablets: the slide-out menu. */}
      <div className="lg:hidden">
        <MobileNav user={user} farms={farms} />
      </div>
      {/* Logo: always on small screens; on large ones only when there is no sidebar to show it. */}
      <div className={cn('ml-1', sideNav && 'lg:hidden')}>
        <Logo href="/dashboard" />
      </div>
      {sideNav && (
        <button
          type="button"
          onClick={() => setPref('collapsed', !prefs.collapsed)}
          className={cn(iconButton, 'hidden lg:flex', prefs.nav === 'right' && 'order-last')}
          aria-label={prefs.collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={prefs.collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <CollapseIcon className="h-[18px] w-[18px]" />
        </button>
      )}

      <div className="ml-auto flex items-center gap-1">
        <ZoomControls />
        <FullscreenButton />
        <ThemeMenu />
        <button type="button" onClick={() => setSettingsOpen(true)} className={iconButton} aria-label="Site settings" title="Site settings">
          <Settings2 className="h-[18px] w-[18px]" />
        </button>
        <div className="ml-1.5 border-l pl-2.5">
          <AccountMenu user={user} variant="appbar" />
        </div>
      </div>

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </header>
  );
}

/** − 100% + : steps through the zoom levels; the percentage resets to 100%. */
function ZoomControls() {
  const { prefs, setPref } = usePreferences();
  const index = ZOOM_LEVELS.indexOf(prefs.zoom as (typeof ZOOM_LEVELS)[number]);
  const step = (by: number) => {
    const next = ZOOM_LEVELS[index + by];
    if (next) setPref('zoom', next);
  };
  return (
    <div className="hidden items-center rounded-lg border sm:flex">
      <button type="button" onClick={() => step(-1)} disabled={index <= 0} className={cn(iconButton, 'h-8 w-8 disabled:opacity-40')} aria-label="Zoom out" title="Zoom out">
        <ZoomOut className="h-4 w-4" />
      </button>
      <button type="button" onClick={() => setPref('zoom', 100)} className="w-12 text-center text-xs font-medium tabular-nums text-muted-foreground hover:text-foreground" title="Reset zoom">
        {prefs.zoom}%
      </button>
      <button
        type="button"
        onClick={() => step(1)}
        disabled={index >= ZOOM_LEVELS.length - 1}
        className={cn(iconButton, 'h-8 w-8 disabled:opacity-40')}
        aria-label="Zoom in"
        title="Zoom in"
      >
        <ZoomIn className="h-4 w-4" />
      </button>
    </div>
  );
}

function FullscreenButton() {
  const [supported, setSupported] = useState(false);
  const [active, setActive] = useState(false);
  useEffect(() => {
    setSupported(document.fullscreenEnabled);
    const onChange = () => setActive(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  if (!supported) return null;

  const toggle = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {});
  return (
    <button type="button" onClick={toggle} className={cn(iconButton, 'hidden sm:flex')} aria-label={active ? 'Exit full screen' : 'Full screen'} title={active ? 'Exit full screen' : 'Full screen'}>
      {active ? <Minimize className="h-[18px] w-[18px]" /> : <Maximize className="h-[18px] w-[18px]" />}
    </button>
  );
}

const THEMES: { mode: ThemeMode; label: string; icon: typeof Sun }[] = [
  { mode: 'light', label: 'Light', icon: Sun },
  { mode: 'dark', label: 'Dark', icon: Moon },
  { mode: 'system', label: 'System', icon: Monitor },
];

function ThemeMenu() {
  const { theme, setTheme } = usePreferences();
  return (
    <Menu
      label="Theme"
      align="end"
      className="min-w-40"
      triggerClassName={iconButton}
      trigger={
        <>
          <Sun className="h-[18px] w-[18px] dark:hidden" />
          <Moon className="hidden h-[18px] w-[18px] dark:block" />
        </>
      }
    >
      {(close) =>
        THEMES.map(({ mode, label, icon: Icon }) => (
          <button
            key={mode}
            type="button"
            role="menuitemradio"
            aria-checked={theme === mode}
            onClick={() => {
              setTheme(mode);
              close();
            }}
            className={cn(menuItemClasses, theme === mode && 'bg-muted font-medium')}
          >
            <Icon className="h-4 w-4 text-muted-foreground" /> {label}
          </button>
        ))
      }
    </Menu>
  );
}

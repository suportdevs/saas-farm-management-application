'use client';

import type { ReactNode } from 'react';
import { Check, Monitor, Moon, RotateCcw, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { COLORS, FONTS, NAV_POSITIONS, SIZES, ZOOM_LEVELS, type NavPosition } from '@/lib/preferences';
import { cn } from '@/lib/utils';
import { usePreferences } from './preferences-provider';

/** Off-canvas "Site settings": theme, colors, layout, font and zoom. Saved in this browser. */
export function SettingsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { prefs, setPref, reset, theme, setTheme } = usePreferences();
  const sideNav = prefs.nav === 'left' || prefs.nav === 'right';

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Site settings"
      description="Customize how the app looks. Saved in this browser."
      footer={
        <Button variant="outline" className="w-full" onClick={reset}>
          <RotateCcw className="h-4 w-4" /> Reset to default
        </Button>
      }
    >
      <div className="space-y-7">
        <Group title="Theme">
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ['light', 'Light', Sun],
                ['dark', 'Dark', Moon],
                ['system', 'System', Monitor],
              ] as const
            ).map(([mode, label, Icon]) => (
              <Choice key={mode} selected={theme === mode} onClick={() => setTheme(mode)}>
                <Icon className="h-4 w-4" />
                {label}
              </Choice>
            ))}
          </div>
        </Group>

        <Group title="Color palette">
          <div className="grid grid-cols-7 gap-2">
            {COLORS.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setPref('color', c.key)}
                title={c.label}
                aria-label={c.label}
                aria-pressed={prefs.color === c.key}
                className={cn('flex aspect-square items-center justify-center rounded-full ring-offset-2 ring-offset-card transition-transform hover:scale-110', prefs.color === c.key && 'ring-2 ring-foreground')}
                style={{ background: c.swatch }}
              >
                {prefs.color === c.key && <Check className="h-4 w-4 text-white" />}
              </button>
            ))}
          </div>
        </Group>

        <Group title="Sidebar style">
          <div className="grid grid-cols-2 gap-2">
            <Choice selected={prefs.sidebar === 'brand'} onClick={() => setPref('sidebar', 'brand')}>
              <span className="h-4 w-4 rounded bg-sidebar ring-1 ring-border" /> Brand
            </Choice>
            <Choice selected={prefs.sidebar === 'theme'} onClick={() => setPref('sidebar', 'theme')}>
              <span className="h-4 w-4 rounded bg-card ring-1 ring-border" /> Match theme
            </Choice>
          </div>
        </Group>

        <Group title="Menu position" hint="On large screens. Phones always use the slide-out menu.">
          <div className="grid grid-cols-4 gap-2">
            {NAV_POSITIONS.map((pos) => (
              <button
                key={pos}
                type="button"
                onClick={() => setPref('nav', pos)}
                aria-pressed={prefs.nav === pos}
                className={cn('rounded-lg border p-1.5 text-center text-xs font-medium capitalize transition-colors', prefs.nav === pos ? 'border-primary bg-primary/5 text-foreground' : 'text-muted-foreground hover:bg-muted')}
              >
                <LayoutPreview position={pos} />
                <span className="mt-1 block">{pos}</span>
              </button>
            ))}
          </div>
          {sideNav && (
            <label className="mt-3 flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2.5 text-sm">
              Collapsed sidebar (icons only)
              <input type="checkbox" checked={prefs.collapsed} onChange={(e) => setPref('collapsed', e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
            </label>
          )}
        </Group>

        <Group title="Content width">
          <div className="grid grid-cols-2 gap-2">
            <Choice selected={prefs.width === 'boxed'} onClick={() => setPref('width', 'boxed')}>
              Boxed
            </Choice>
            <Choice selected={prefs.width === 'full'} onClick={() => setPref('width', 'full')}>
              Full width
            </Choice>
          </div>
        </Group>

        <Group title="Font">
          <div className="grid grid-cols-2 gap-2">
            {FONTS.map((f) => (
              <Choice key={f.key} selected={prefs.font === f.key} onClick={() => setPref('font', f.key)}>
                <span style={{ fontFamily: f.sample }}>{f.label}</span>
              </Choice>
            ))}
          </div>
        </Group>

        <Group title="Text size">
          <div className="grid grid-cols-3 gap-2">
            {SIZES.map((s, i) => (
              <Choice key={s.key} selected={prefs.size === s.key} onClick={() => setPref('size', s.key)}>
                <span className={['text-xs', 'text-sm', 'text-base'][i]}>Aa</span> {s.label}
              </Choice>
            ))}
          </div>
        </Group>

        <Group title="Content zoom" hint="Also in the top bar.">
          <div className="grid grid-cols-6 gap-1.5">
            {ZOOM_LEVELS.map((z) => (
              <Choice key={z} selected={prefs.zoom === z} onClick={() => setPref('zoom', z)} compact>
                {z}%
              </Choice>
            ))}
          </div>
        </Group>
      </div>
    </Sheet>
  );
}

function Group({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

function Choice({ selected, onClick, children, compact }: { selected: boolean; onClick: () => void; children: ReactNode; compact?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'flex items-center justify-center gap-2 rounded-lg border text-sm font-medium transition-colors',
        compact ? 'px-1 py-2 text-xs' : 'px-3 py-2.5',
        selected ? 'border-primary bg-primary/5 text-foreground ring-1 ring-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

/** A tiny wireframe of the page with the menu on one side. */
function LayoutPreview({ position }: { position: NavPosition }) {
  const vertical = position === 'left' || position === 'right';
  return (
    <span className={cn('flex h-10 gap-0.5 rounded-md bg-muted p-0.5', vertical ? (position === 'right' ? 'flex-row-reverse' : 'flex-row') : position === 'bottom' ? 'flex-col-reverse' : 'flex-col')}>
      <span className={cn('rounded-sm bg-primary/70', vertical ? 'w-2.5' : 'h-2')} />
      <span className="flex-1 rounded-sm bg-card" />
    </span>
  );
}

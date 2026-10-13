import { Check, Droplets, HeartPulse, TrendingUp } from 'lucide-react';
import { appName, cn } from '@/lib/utils';

const highlights = [
  'Every animal, record and task in one place',
  'Works in your language, currency and units',
  'Invite your whole team with the right access',
];

const snapshot = [
  { icon: Droplets, label: 'Milk today', value: '8,420 L', delta: '+3.2%' },
  { icon: HeartPulse, label: 'Health alerts', value: '2', delta: 'due today' },
  { icon: TrendingUp, label: 'Pregnancy rate', value: '61%', delta: '+5 pts' },
];

/** Marketing side panel used by the split and card layouts. */
export function BrandPanel({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'relative flex flex-col justify-between overflow-hidden bg-gradient-to-br from-emerald-800 via-green-800 to-teal-950 p-10 text-white',
        className,
      )}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.12]"
        style={{
          backgroundImage: 'linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)',
          backgroundSize: '32px 32px',
          maskImage: 'radial-gradient(ellipse at 30% 20%, black, transparent 70%)',
        }}
      />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-80 w-80 rounded-full bg-amber-400/25 blur-3xl" />
      <div className="pointer-events-none absolute -left-20 top-1/3 h-60 w-60 rounded-full bg-lime-300/15 blur-3xl" />

      <div className="relative">
        <p className="text-sm font-medium uppercase tracking-widest text-white/70">{appName}</p>
        <h2 className="mt-4 max-w-sm text-3xl font-bold leading-tight">The operating system for modern cattle farms.</h2>
        <ul className="mt-8 space-y-3 text-sm text-white/90">
          {highlights.map((h) => (
            <li key={h} className="flex items-center gap-3">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20">
                <Check className="h-3.5 w-3.5" />
              </span>
              {h}
            </li>
          ))}
        </ul>
      </div>

      <figure className="animate-float relative mt-10 rounded-2xl bg-white/10 p-5 ring-1 ring-white/20 backdrop-blur">
        <figcaption className="mb-4 flex items-center justify-between text-xs uppercase tracking-wider text-white/60">
          <span>Farm snapshot</span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-lime-300" /> Live
          </span>
        </figcaption>
        <div className="grid grid-cols-3 gap-3">
          {snapshot.map(({ icon: Icon, label, value, delta }) => (
            <div key={label} className="rounded-xl bg-white/10 p-3">
              <Icon className="h-4 w-4 text-lime-200" />
              <p className="mt-2 text-lg font-semibold tabular-nums">{value}</p>
              <p className="text-[11px] text-white/70">{label}</p>
              <p className="mt-1 text-[11px] font-medium text-amber-200">{delta}</p>
            </div>
          ))}
        </div>
      </figure>
    </div>
  );
}

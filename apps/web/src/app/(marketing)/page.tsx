import Link from 'next/link';
import {
  ArrowRight,
  Building2,
  Check,
  ClipboardCheck,
  Dna,
  Globe2,
  Languages,
  Lock,
  Milk,
  Ruler,
  ShieldCheck,
  Smartphone,
  Stethoscope,
  Users,
  Wallet,
  Wheat,
} from 'lucide-react';
import { CowMark } from '@/components/logo';
import { buttonClasses } from '@/components/ui/button';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

const features = [
  { icon: CowMark, title: 'Herd register', text: 'Every animal with tags, lineage, groups, movements and a complete lifetime history.' },
  { icon: Milk, title: 'Milk recording', text: 'Per-cow and bulk-tank yields, lactation curves, quality and withdrawal alerts.' },
  { icon: Stethoscope, title: 'Health & treatments', text: 'Vaccinations, treatments and vet visits, with withdrawal periods tracked for you.' },
  { icon: Dna, title: 'Breeding & calving', text: 'Heats, inseminations, pregnancy checks and a calving calendar that plans ahead.' },
  { icon: Wheat, title: 'Feed & inventory', text: 'Rations, feed stock and true cost per animal and per litre.' },
  { icon: Wallet, title: 'Farm finance', text: 'Income, expenses and profitability per enterprise, in your own currency.' },
  { icon: ClipboardCheck, title: 'Tasks & routines', text: 'Plan the day, assign the work and see what got done.' },
  { icon: Users, title: 'Team & roles', text: 'Owners, managers, vets, accountants and workers — each sees exactly what they need.' },
];

const EXAMPLES = [
  { flag: '🇳🇿', country: 'New Zealand', money: formatMoney(1250000, 'NZD', 'en-NZ'), units: 'Litres · kg · ha' },
  { flag: '🇺🇸', country: 'United States', money: formatMoney(1250000, 'USD', 'en-US'), units: 'Pounds · lb · acres' },
  { flag: '🇧🇩', country: 'Bangladesh', money: formatMoney(1250000, 'BDT', 'bn-BD'), units: 'Litres · kg · ha' },
  { flag: '🇧🇷', country: 'Brazil', money: formatMoney(1250000, 'BRL', 'pt-BR'), units: 'Litros · kg · ha' },
  { flag: '🇩🇪', country: 'Germany', money: formatMoney(1250000, 'EUR', 'de-DE'), units: 'Liter · kg · ha' },
  { flag: '🇰🇪', country: 'Kenya', money: formatMoney(1250000, 'KES', 'en-KE'), units: 'Litres · kg · ha' },
];

export default function HomePage() {
  return (
    <>
      {/* ─── Hero ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="bg-dots pointer-events-none absolute inset-0 opacity-70 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
        <div className="pointer-events-none absolute -top-48 left-1/2 h-[36rem] w-[60rem] -translate-x-1/2 rounded-full bg-gradient-to-br from-primary/25 via-lime-300/15 to-accent/20 blur-3xl" />
        <div className="relative mx-auto max-w-6xl px-6 pb-10 pt-16 text-center sm:pt-24">
          <span className="inline-flex animate-fade-up items-center gap-2 rounded-full border bg-card/80 px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" /> Built for dairy & beef farms in every country
          </span>
          <h1 className="mx-auto mt-6 max-w-4xl animate-fade-up text-4xl font-extrabold tracking-tight [animation-delay:60ms] sm:text-6xl lg:text-7xl">
            Run your whole herd from <span className="text-gradient">one place.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl animate-fade-up text-lg text-muted-foreground [animation-delay:120ms] sm:text-xl">
            Records, milk, health, breeding, feed and finance — shared with your team, in your language, currency and units. From 20 cows to 20,000.
          </p>
          <div className="mt-10 flex animate-fade-up flex-wrap justify-center gap-3 [animation-delay:180ms]">
            <Link href="/register" className={buttonClasses('primary', 'lg', 'h-12 px-7 shadow-lg shadow-primary/25')}>
              Start your free trial <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/pricing" className={buttonClasses('outline', 'lg', 'h-12 px-7')}>
              See pricing
            </Link>
          </div>
          <p className="mt-4 animate-fade-up text-xs text-muted-foreground [animation-delay:220ms]">14 days of Professional free · No credit card · Free plan forever for small herds</p>
        </div>

        <div className="relative mx-auto max-w-6xl px-6 pb-20">
          <ProductMockup />
        </div>
      </section>

      {/* ─── Trust strip ─────────────────────────────────────── */}
      <section className="border-y bg-card/50">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-6 py-8 text-center md:grid-cols-4">
          {[
            { icon: Globe2, label: '200+ countries & territories' },
            { icon: Wallet, label: '150+ currencies' },
            { icon: Ruler, label: 'Metric & imperial units' },
            { icon: Lock, label: 'Private, per-farm data' },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center justify-center gap-2.5 text-sm font-medium">
              <Icon className="h-4 w-4 text-primary" /> {label}
            </div>
          ))}
        </div>
      </section>

      {/* ─── Features ────────────────────────────────────────── */}
      <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">Everything in one app</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Replace the notebooks, whiteboards and spreadsheets</h2>
          <p className="mt-4 text-muted-foreground">Every record your farm keeps, connected — so a treatment shows up in the milk withdrawal list, and a calving updates the herd.</p>
        </div>
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map(({ icon: Icon, title, text }) => (
            <div key={title} className="group rounded-2xl border bg-card p-6 shadow-sm transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="mt-5 font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Worldwide ───────────────────────────────────────── */}
      <section id="global" className="scroll-mt-20 bg-gradient-to-b from-transparent via-primary/5 to-transparent py-24">
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-6 lg:grid-cols-2">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-primary">Made for the world</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Your farm, your currency, your units</h2>
            <p className="mt-4 text-muted-foreground">
              Every farm keeps its own country, time zone, currency, number format and units. Run a dairy in Waikato and a beef station in Queensland from the same login
              — each one speaks its own language of numbers.
            </p>
            <ul className="mt-8 space-y-4">
              {[
                { icon: Languages, text: 'Dates and numbers formatted for 25+ locales' },
                { icon: Ruler, text: 'Litres, kilograms or US gallons and pounds — per farm' },
                { icon: Building2, text: 'Unlimited farms per account, each with its own team and plan' },
                { icon: Smartphone, text: 'Works on any phone, tablet or computer' },
              ].map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-card text-primary shadow-sm ring-1 ring-border">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="text-sm font-medium">{text}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {EXAMPLES.map((e, i) => (
              <div key={e.country} className={cn('rounded-2xl border bg-card p-5 shadow-sm', i % 2 === 1 && 'sm:translate-y-6')}>
                <p className="text-sm font-medium">
                  <span className="mr-1.5 text-lg">{e.flag}</span>
                  {e.country}
                </p>
                <p className="mt-3 text-2xl font-bold tracking-tight tabular-nums">{e.money}</p>
                <p className="mt-1 text-xs text-muted-foreground">{e.units}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Roles ───────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <div className="grid gap-12 rounded-3xl border bg-card p-8 shadow-sm sm:p-12 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-primary">Your whole team</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight">The right access for everyone on the farm</h2>
            <p className="mt-4 text-muted-foreground">
              Invite staff by email. Workers record the day&apos;s jobs, the vet logs treatments, the accountant sees the books — and only owners touch billing.
            </p>
            <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-primary" /> Every change is recorded in the farm&apos;s activity log.
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ['Owner', 'Everything, including billing'],
              ['Manager', 'Runs operations and the team'],
              ['Veterinarian', 'Health, treatments, breeding'],
              ['Accountant', 'Finance, invoices and reports'],
              ['Farm worker', 'Daily milking, feeding and events'],
              ['Viewer', 'Read-only for advisors'],
            ].map(([role, text]) => (
              <div key={role} className="flex items-start gap-3 rounded-xl border bg-background p-4">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-semibold">{role}</p>
                  <p className="text-xs text-muted-foreground">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA ─────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-800 via-green-800 to-teal-900 px-8 py-16 text-center text-white shadow-2xl sm:px-16">
          <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-amber-300/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-10 h-72 w-72 rounded-full bg-lime-300/20 blur-3xl" />
          <CowMark className="relative mx-auto h-12 w-12 text-lime-200" />
          <h2 className="relative mx-auto mt-6 max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">Set up your farm in a minute</h2>
          <p className="relative mx-auto mt-4 max-w-xl text-white/80">Start with a 14-day Professional trial. Keep the free Starter plan for as long as you like.</p>
          <Link href="/register" className={buttonClasses('primary', 'lg', 'relative mt-8 h-12 bg-white px-8 text-emerald-900 shadow-lg hover:bg-white/90')}>
            Create your free account <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </>
  );
}

/** Decorative app screenshot built in HTML so it follows the theme. */
function ProductMockup() {
  const bars = [62, 70, 66, 74, 71, 78, 83, 80, 86, 84, 90, 88, 93, 91];
  return (
    <div className="relative mx-auto max-w-5xl animate-fade-up [animation-delay:260ms]" aria-hidden>
      <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-primary/30 via-lime-300/20 to-accent/30 opacity-60 blur-2xl" />
      <div className="relative overflow-hidden rounded-2xl border bg-card shadow-2xl">
        <div className="flex items-center gap-1.5 border-b bg-muted/60 px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
          <span className="ml-4 hidden rounded-md bg-background px-3 py-0.5 text-[11px] text-muted-foreground sm:block">app/farms/green-valley-dairy</span>
        </div>
        <div className="grid grid-cols-[3.5rem_1fr] sm:grid-cols-[12rem_1fr]">
          <div className="space-y-1.5 bg-sidebar p-3 text-sidebar-foreground">
            <div className="mb-4 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-white">
                <CowMark className="h-4 w-4" />
              </span>
              <span className="hidden text-xs font-semibold sm:block">Green Valley Dairy</span>
            </div>
            {['Overview', 'Herd', 'Milk', 'Health', 'Breeding', 'Feed', 'Finance'].map((l, i) => (
              <div key={l} className={cn('flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px]', i === 0 ? 'bg-sidebar-accent text-white' : 'text-sidebar-muted')}>
                <span className={cn('h-3 w-3 rounded', i === 0 ? 'bg-sidebar-primary' : 'bg-white/15')} />
                <span className="hidden sm:inline">{l}</span>
              </div>
            ))}
          </div>
          <div className="space-y-4 bg-background p-4 text-left sm:p-6">
            <div>
              <p className="text-[11px] text-muted-foreground">Good morning, Aroha</p>
              <p className="text-sm font-semibold sm:text-base">Here&apos;s the latest at Green Valley Dairy</p>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                ['Milking cows', '312', '+4 this week'],
                ['Milk today', '8,420 L', '+3.2% vs avg'],
                ['Due to calve', '18', 'next 30 days'],
                ['Health alerts', '2', 'withdrawal ends today'],
              ].map(([k, v, h]) => (
                <div key={k} className="rounded-xl border bg-card p-3">
                  <p className="text-[10px] text-muted-foreground">{k}</p>
                  <p className="mt-1 text-base font-bold tabular-nums sm:text-lg">{v}</p>
                  <p className="text-[10px] text-primary">{h}</p>
                </div>
              ))}
            </div>
            <div className="grid gap-3 lg:grid-cols-[1.6fr_1fr]">
              <div className="rounded-xl border bg-card p-3">
                <p className="text-[11px] font-medium">Daily milk — last 14 days</p>
                <div className="mt-3 flex h-24 items-end gap-[3px] border-b">
                  {bars.map((b, i) => (
                    <div key={i} className="flex-1 rounded-t-[4px] bg-primary" style={{ height: `${b}%`, opacity: i === bars.length - 1 ? 1 : 0.75 }} />
                  ))}
                </div>
              </div>
              <div className="space-y-2 rounded-xl border bg-card p-3">
                <p className="text-[11px] font-medium">Today&apos;s tasks</p>
                {['Morning milking', 'Pregnancy checks — pen 4', 'Footbath', 'Feed delivery'].map((t, i) => (
                  <div key={t} className="flex items-center gap-2 text-[11px]">
                    <span className={cn('flex h-3.5 w-3.5 items-center justify-center rounded-full border', i < 2 && 'border-primary bg-primary text-white')}>
                      {i < 2 && <Check className="h-2.5 w-2.5" />}
                    </span>
                    <span className={i < 2 ? 'text-muted-foreground line-through' : ''}>{t}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

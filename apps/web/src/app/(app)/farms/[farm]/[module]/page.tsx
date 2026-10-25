import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Check, Lock, Rocket } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { buttonClasses } from '@/components/ui/button';
import { getFarmContext } from '@/modules/farms/server';
import { getPlans } from '@/modules/subscriptions/server';
import { findModule } from '@/modules/farms/navigation';

type Props = { params: Promise<{ farm: string; module: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { module } = await params;
  return { title: findModule(module)?.label ?? 'Not found' };
}

/**
 * Placeholder for operation modules that haven't shipped yet. A real page at
 * app/(app)/farms/[farm]/<module>/page.tsx takes precedence over this route.
 */
export default async function ModulePage({ params }: Props) {
  const { farm: slug, module } = await params;
  const mod = findModule(module);
  if (!mod) notFound();
  const [ctx, plans] = await Promise.all([getFarmContext(slug), getPlans()]);
  const Icon = mod.icon;
  const included = !mod.capability || ctx.capabilities.includes(mod.capability);
  const disabled = (ctx.modules as Record<string, string>)[mod.slug] === 'disabled';
  const cheapest = mod.capability ? plans.find((p) => p.capabilities.includes(mod.capability!)) : undefined;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href={`/farms/${slug}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Overview
      </Link>
      <section className="relative mt-6 overflow-hidden rounded-3xl border bg-card p-8 shadow-sm sm:p-12">
        <div className="bg-dots pointer-events-none absolute inset-0 opacity-60 [mask-image:radial-gradient(ellipse_at_top_right,black,transparent_60%)]" />
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-primary/15 blur-3xl" />
        <div className="relative">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-emerald-700 text-white shadow-lg shadow-primary/30">
            <Icon className="h-7 w-7" />
          </span>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">{mod.label}</h1>
            <Badge variant="accent">
              <Rocket className="h-3 w-3" /> Coming next
            </Badge>
          </div>
          <p className="mt-3 max-w-xl text-lg text-muted-foreground">{mod.summary}</p>

          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {mod.highlights.map((h) => (
              <li key={h} className="flex items-start gap-3 rounded-xl border bg-background/60 px-4 py-3 text-sm">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {h}
              </li>
            ))}
          </ul>

          <div className="mt-8 flex flex-wrap items-center gap-3 border-t pt-6 text-sm">
            {disabled ? (
              <>
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Lock className="h-4 w-4" /> {mod.label} is switched off for this farm.
                </p>
                {ctx.membership.permissions.includes('farm.update') && (
                  <Link href={`/farms/${slug}/settings#modules`} className={buttonClasses('outline', 'sm')}>
                    Manage modules
                  </Link>
                )}
              </>
            ) : included ? (
              <p className="text-muted-foreground">
                <span className="font-medium text-foreground">Included in your {ctx.subscription.planName} plan.</span> It will appear here automatically when it launches.
              </p>
            ) : (
              <>
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Lock className="h-4 w-4" /> Available on {cheapest?.name ?? 'a higher plan'} and above.
                </p>
                {ctx.membership.permissions.includes('billing.view') && (
                  <Link href={`/farms/${slug}/billing`} className={buttonClasses('primary', 'sm')}>
                    See plans
                  </Link>
                )}
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

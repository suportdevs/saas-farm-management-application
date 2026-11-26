import Link from 'next/link';
import { Check, Lock } from 'lucide-react';
import type { FarmContext, PermissionModule } from '@kit/shared';
import { buttonClasses } from '@/components/ui/button';
import { getT } from '@/i18n/server';
import { getPlans } from '@/modules/subscriptions/server';
import { ALL_MODULES } from '@/modules/farms/navigation';

/**
 * Shown instead of a module's page when the farm can't use the module: it isn't
 * in the plan (with the cheapest plan that has it and a link to billing) or it
 * was switched off in farm settings. Returns null when the module is enabled.
 */
export async function ModuleLocked({ ctx, module }: { ctx: FarmContext; module: PermissionModule }) {
  const status = ctx.modules[module];
  if (status === 'enabled') return null;
  const mod = ALL_MODULES.find((m) => m.slug === module || m.permissionModule === module);
  const t = await getT(ctx.farm.slug);
  const label = t(mod?.label ?? module);
  const slug = ctx.farm.slug;
  const plans = status === 'plan' ? await getPlans() : [];
  const cheapest = mod?.capability ? plans.find((p) => p.capabilities.includes(mod.capability!)) : undefined;
  const Icon = mod?.icon;

  return (
    <div className="mx-auto max-w-3xl">
      <section className="relative overflow-hidden rounded-3xl border bg-card p-8 shadow-sm sm:p-12">
        <div className="relative">
          {Icon && (
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-emerald-700 text-white shadow-lg shadow-primary/30">
              <Icon className="h-7 w-7" />
            </span>
          )}
          <h1 className="mt-6 flex items-center gap-2 text-3xl font-bold tracking-tight">
            {label} <Lock className="h-6 w-6 text-muted-foreground" />
          </h1>
          {mod && <p className="mt-3 max-w-xl text-lg text-muted-foreground">{t(mod.summary)}</p>}
          {mod && (
            <ul className="mt-8 grid gap-3 sm:grid-cols-2">
              {mod.highlights.map((h) => (
                <li key={h} className="flex items-start gap-3 rounded-xl border bg-background/60 px-4 py-3 text-sm">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {t(h)}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-8 flex flex-wrap items-center gap-3 border-t pt-6 text-sm">
            {status === 'disabled' ? (
              <>
                <p className="text-muted-foreground">{t('{module} is switched off for this farm.', { module: label })}</p>
                {ctx.membership.permissions.includes('farm.update') && (
                  <Link href={`/farms/${slug}/settings#modules`} className={buttonClasses('outline', 'sm')}>
                    {t('Manage modules')}
                  </Link>
                )}
              </>
            ) : (
              <>
                <p className="text-muted-foreground">
                  <span className="font-medium text-foreground">{t("{module} isn't in your {plan} plan.", { module: label, plan: ctx.subscription.planName })}</span>{' '}
                  {cheapest ? t('Available on {plan} and above.', { plan: cheapest.name }) : t('Available on a higher plan.')}
                </p>
                {ctx.membership.permissions.includes('billing.view') && (
                  <Link href={`/farms/${slug}/billing`} className={buttonClasses('primary', 'sm')}>
                    {t('See plans')}
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

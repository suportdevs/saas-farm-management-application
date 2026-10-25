import type { Metadata } from 'next';
import { PricingTable } from '@/modules/subscriptions/components/pricing-table';
import { getPlans } from '@/modules/subscriptions/server';

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Simple per-farm pricing. Free for small herds, with a 14-day trial of every feature.',
};

const FAQ = [
  ['Is there really a free plan?', 'Yes. Starter is free forever for up to 25 animals and 2 team members. Every new farm also gets a 14-day trial of Professional — no card needed.'],
  ['How is pricing calculated?', 'Each farm has its own subscription, priced by plan rather than per user. Run several farms? Each can be on the plan that suits it.'],
  ['What happens when my trial ends?', "Your farm moves to the free Starter plan unless you pick a paid plan. Nothing is ever deleted — you'll just need to upgrade to add more animals or team members."],
  ['Can I pay in my own currency?', 'Plans are priced in US dollars and your card is charged in USD; your bank converts automatically. Inside the app, all farm records use your own currency.'],
  ['Can I change or cancel my plan later?', 'Any time, from Plan & billing. Upgrades take effect immediately with pro-rated billing; cancellations apply at the end of the period.'],
  ['Do you offer invoicing for co-ops and groups?', 'Yes. Enterprise customers can pay by invoice with custom terms, volume pricing, SSO and a dedicated success manager.'],
  ['Who owns the data?', 'You do. Your records are private to your farm team, and owners can export them at any time on paid plans.'],
];

export default async function PricingPage() {
  const plans = await getPlans();
  return (
    <div className="relative">
      <div className="bg-dots pointer-events-none absolute inset-x-0 top-0 h-[28rem] opacity-60 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
      <div className="relative mx-auto max-w-6xl px-6 py-16 sm:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">Pricing</p>
          <h1 className="mt-3 text-4xl font-extrabold tracking-tight sm:text-5xl">Simple pricing that grows with your herd</h1>
          <p className="mt-4 text-lg text-muted-foreground">Start free. Upgrade when you need more animals, more people or deeper insight.</p>
        </div>
        <div className="mt-12">
          <PricingTable plans={plans} />
        </div>

        <section id="faq" className="mx-auto mt-28 max-w-3xl scroll-mt-24">
          <h2 className="text-center text-3xl font-bold tracking-tight">Frequently asked questions</h2>
          <div className="mt-10 divide-y rounded-2xl border bg-card">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group px-6 py-5 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                  {q}
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-muted-foreground transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{a}</p>
              </details>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { History } from 'lucide-react';
import type { FarmActivityEntry, Pagination as PaginationInfo } from '@kit/shared';
import { PageHeader } from '@/components/app/page-header';
import { Pagination } from '@/components/app/pagination';
import { Avatar } from '@/components/app/user-menu';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { activityDetail } from '@/modules/farms/activity';
import { ActivityExport } from '@/modules/farms/components/activity-export';
import { getFarmContext } from '@/modules/farms/server';
import { ACTIVITY_LABELS } from '@/modules/farms/navigation';
import { formatFarmDate } from '@/lib/format';
import { serverFetch } from '@/lib/session';
import { getPlans } from '@/modules/subscriptions/server';

export const metadata: Metadata = { title: 'Activity' };

export default async function ActivityPage({ params, searchParams }: { params: Promise<{ farm: string }>; searchParams: Promise<{ page?: string }> }) {
  const { farm: slug } = await params;
  const { page = '1' } = await searchParams;
  const ctx = await getFarmContext(slug);
  if (!ctx.membership.permissions.includes('activity.view')) notFound();
  const [data, plans] = await Promise.all([
    serverFetch<{ entries: FarmActivityEntry[]; pagination: PaginationInfo }>(`/farms/${slug}/activity?page=${Number(page) || 1}&pageSize=30`),
    getPlans(),
  ]);
  const entries = data?.entries ?? [];

  // Group entries by day in the farm's time zone.
  const groups = new Map<string, FarmActivityEntry[]>();
  for (const e of entries) {
    const day = formatFarmDate(e.createdAt, ctx.farm, { dateStyle: 'full' });
    groups.set(day, [...(groups.get(day) ?? []), e]);
  }

  return (
    <>
      <PageHeader
        title="Activity"
        description={`A record of changes made on ${ctx.farm.name}, in the farm's local time.`}
        actions={<ActivityExport farm={ctx.farm} plans={plans} disabled={entries.length === 0} />}
      />
      {entries.length === 0 ? (
        <EmptyState icon={History} title="No activity yet" description="Changes to the farm, its team and its plan will show up here." />
      ) : (
        <div className="space-y-8">
          {[...groups].map(([day, items]) => (
            <section key={day}>
              <h2 className="mb-3 text-sm font-semibold text-muted-foreground">{day}</h2>
              <Card className="divide-y">
                {items.map((e) => {
                  const extra = activityDetail(e, plans);
                  return (
                    <div key={e.id} className="flex items-start gap-4 px-5 py-4">
                      {e.actor ? <Avatar user={{ name: e.actor.name, image: null }} size={32} /> : <span className="h-8 w-8 rounded-full bg-muted" />}
                      <div className="min-w-0 flex-1 text-sm">
                        <p>
                          <span className="font-medium">{e.actor?.name ?? 'Someone'}</span>{' '}
                          <span className="text-muted-foreground">{ACTIVITY_LABELS[e.action] ?? e.action}</span>
                        </p>
                        {extra && <p className="mt-0.5 truncate text-xs text-muted-foreground">{extra}</p>}
                      </div>
                      <time className="shrink-0 text-xs tabular-nums text-muted-foreground" dateTime={e.createdAt}>
                        {formatFarmDate(e.createdAt, ctx.farm, { timeStyle: 'short' })}
                      </time>
                    </div>
                  );
                })}
              </Card>
            </section>
          ))}
          {data && <Pagination pagination={data.pagination} basePath={`/farms/${slug}/activity`} params={{}} />}
        </div>
      )}
    </>
  );
}

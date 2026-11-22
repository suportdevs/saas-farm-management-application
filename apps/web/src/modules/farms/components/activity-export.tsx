'use client';

import type { FarmActivityEntry, FarmProfile, Pagination, PublicPlan } from '@kit/shared';
import { ExportMenu } from '@/components/app/export-menu';
import { api } from '@/lib/api';
import { formatFarmDate } from '@/lib/format';
import { activityDetail } from '../activity';
import { ACTIVITY_LABELS } from '../navigation';

/** Most pages fetched for one download (100 entries each). */
const MAX_PAGES = 50;

/** Download menu for the farm's whole activity log (not just the page on screen). */
export function ActivityExport({
  farm,
  plans,
  disabled,
}: {
  farm: Pick<FarmProfile, 'slug' | 'name' | 'locale' | 'timezone'>;
  plans: PublicPlan[];
  disabled?: boolean;
}) {
  const loadAll = async () => {
    const entries: FarmActivityEntry[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const res = await api.get<{ entries: FarmActivityEntry[]; pagination: Pagination }>(`/farms/${farm.slug}/activity?page=${page}&pageSize=100`);
      entries.push(...res.entries);
      if (page * 100 >= res.pagination.total) break;
    }
    return entries;
  };

  return (
    <ExportMenu
      disabled={disabled}
      load={async () => {
        const entries = await loadAll();
        return {
          filename: 'activity',
          title: 'Activity',
          subtitle: `${farm.name} · ${entries.length} entries · ${farm.timezone}`,
          headers: ['Date', 'Time', 'Who', 'Email', 'Action', 'Detail'],
          rows: entries.map((e) => [
            formatFarmDate(e.createdAt, farm, { dateStyle: 'medium' }),
            formatFarmDate(e.createdAt, farm, { timeStyle: 'short' }),
            e.actor?.name ?? 'Someone',
            e.actor?.email ?? '',
            ACTIVITY_LABELS[e.action] ?? e.action,
            activityDetail(e, plans) ?? '',
          ]),
        };
      }}
    />
  );
}

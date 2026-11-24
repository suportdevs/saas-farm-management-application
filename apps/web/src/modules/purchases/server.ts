import 'server-only';
import type { Pagination, PurchaseDetail, PurchaseRow } from '@kit/shared';
import { serverFetch } from '@/lib/session';

/** One page of the farm's purchases for the URL query (search, filters, page, pageSize). */
export async function getPurchases(farm: string, query: Record<string, string | undefined>) {
  const qs = new URLSearchParams(Object.entries(query).filter((e): e is [string, string] => !!e[1]));
  const res = await serverFetch<{ rows: PurchaseRow[]; pagination: Pagination }>(`/farms/${encodeURIComponent(farm)}/purchases?${qs}`);
  return res ?? { rows: [], pagination: { page: 1, pageSize: 25, total: 0 } };
}

/** One purchase with its animal lines, or null. */
export function getPurchase(farm: string, key: string) {
  return serverFetch<PurchaseDetail>(`/farms/${encodeURIComponent(farm)}/purchases/${encodeURIComponent(key)}`);
}

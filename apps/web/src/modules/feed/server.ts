import 'server-only';
import type { FinishReceiveDetail, FinishReceiveRow, Pagination } from '@kit/shared';
import { serverFetch } from '@/lib/session';

/** One page of finish receives for the URL query (search, filters, page, pageSize). */
export async function getFinishReceives(farm: string, query: Record<string, string | undefined>) {
  const qs = new URLSearchParams(Object.entries(query).filter((e): e is [string, string] => !!e[1]));
  const res = await serverFetch<{ rows: FinishReceiveRow[]; pagination: Pagination }>(`/farms/${encodeURIComponent(farm)}/feed/finish-receives?${qs}`);
  return res ?? { rows: [], pagination: { page: 1, pageSize: 25, total: 0 } };
}

/** One receive with its lines, or null. */
export function getFinishReceive(farm: string, key: string) {
  return serverFetch<FinishReceiveDetail>(`/farms/${encodeURIComponent(farm)}/feed/finish-receives/${encodeURIComponent(key)}`);
}

import 'server-only';
import { catalogPath, type CatalogPage, type CatalogResource } from '@kit/shared';
import { serverFetch } from '@/lib/session';

/** One page of a catalog for the given URL query (search, filters, page). */
export async function getCatalogPage(
  farm: string,
  resource: CatalogResource,
  query: Record<string, string>,
): Promise<CatalogPage> {
  const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v));
  const res = await serverFetch<CatalogPage>(
    `/farms/${encodeURIComponent(farm)}/${catalogPath(resource)}?${qs}`,
  );
  return res ?? { rows: [], pagination: { page: 1, pageSize: 25, total: 0 } };
}

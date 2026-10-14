import type { CatalogResource } from '@kit/shared';
import { getCatalogPage } from '../server';
import { CatalogManager } from './catalog-manager';

export type CatalogSearchParams = Record<string, string | string[] | undefined>;

/** Server entry for every catalog page: loads the page of rows the URL asks for. */
export async function CatalogScreen({
  farm,
  resource,
  searchParams,
}: {
  farm: string;
  resource: CatalogResource;
  searchParams: CatalogSearchParams;
}) {
  const query: Record<string, string> = {};
  for (const [k, v] of Object.entries(searchParams))
    if (typeof v === 'string' && v.trim()) query[k] = v.trim();
  const page = await getCatalogPage(farm, resource, query);
  const { page: _page, ...rest } = query;
  return <CatalogManager key={resource} resource={resource} page={page} query={rest} />;
}

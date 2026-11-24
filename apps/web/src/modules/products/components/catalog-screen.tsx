import { notFound } from 'next/navigation';
import { ModuleLocked } from '@/components/app/module-locked';
import { CATALOG, catalogPermission, type CatalogResource } from '@kit/shared';
import { resolvePageSize } from '@/lib/page-size';
import { getFarmContext } from '@/modules/farms/server';
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
  const ctx = await getFarmContext(farm);
  // The module isn't in the plan or is switched off: explain instead of a 404.
  if (ctx.modules[CATALOG[resource].module] !== 'enabled') return <ModuleLocked ctx={ctx} module={CATALOG[resource].module} />;
  if (!ctx.membership.permissions.includes(catalogPermission(resource, 'list'))) notFound();
  const query: Record<string, string> = {};
  for (const [k, v] of Object.entries(searchParams))
    if (typeof v === 'string' && v.trim()) query[k] = v.trim();
  // Rows per page: the list's own selector (?pageSize) or the Site settings default.
  const pageSize = String(await resolvePageSize(query.pageSize));
  const page = await getCatalogPage(farm, resource, { ...query, pageSize });
  const { page: _page, ...rest } = query;
  return <CatalogManager key={resource} resource={resource} page={page} query={rest} />;
}

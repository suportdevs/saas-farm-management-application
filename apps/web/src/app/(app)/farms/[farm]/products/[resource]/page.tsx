import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CATALOG, isCatalogResource, type CatalogResource } from '@kit/shared';
import {
  CatalogScreen,
  type CatalogSearchParams,
} from '@/modules/products/components/catalog-screen';

type Props = {
  params: Promise<{ farm: string; resource: string }>;
  searchParams: Promise<CatalogSearchParams>;
};

/** Every catalog except products itself: /products/product-sizes, /categories, /brands, /units, /sizes, /colors. */
const isMasterData = (resource: string): resource is Exclude<CatalogResource, 'products'> =>
  isCatalogResource(resource) && resource !== 'products';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { resource } = await params;
  return { title: isMasterData(resource) ? CATALOG[resource].plural : 'Not found' };
}

export default async function CatalogPage({ params, searchParams }: Props) {
  const [{ farm, resource }, query] = await Promise.all([params, searchParams]);
  if (!isMasterData(resource)) notFound();
  return <CatalogScreen farm={farm} resource={resource} searchParams={query} />;
}

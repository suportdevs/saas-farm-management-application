import type { Metadata } from 'next';
import { CatalogScreen, type CatalogSearchParams } from '@/modules/products/components/catalog-screen';

export const metadata: Metadata = { title: 'Breeds' };

/** Built-in and farm breeds: /farms/<farm>/herd/breeds. */
export default async function BreedsPage({ params, searchParams }: { params: Promise<{ farm: string }>; searchParams: Promise<CatalogSearchParams> }) {
  const [{ farm }, query] = await Promise.all([params, searchParams]);
  return <CatalogScreen farm={farm} resource="breeds" searchParams={query} />;
}

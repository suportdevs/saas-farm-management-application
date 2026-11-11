import type { Metadata } from 'next';
import { CatalogScreen, type CatalogSearchParams } from '@/modules/products/components/catalog-screen';

export const metadata: Metadata = { title: 'Batches' };

/** Groups of animals: /farms/<farm>/herd/batches. */
export default async function BatchesPage({ params, searchParams }: { params: Promise<{ farm: string }>; searchParams: Promise<CatalogSearchParams> }) {
  const [{ farm }, query] = await Promise.all([params, searchParams]);
  return <CatalogScreen farm={farm} resource="batches" searchParams={query} />;
}

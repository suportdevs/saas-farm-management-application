import type { Metadata } from 'next';
import { CatalogScreen, type CatalogSearchParams } from '@/modules/products/components/catalog-screen';

export const metadata: Metadata = { title: 'Suppliers' };

/** Who the farm buys from: /farms/<farm>/distribution/suppliers. */
export default async function SuppliersPage({ params, searchParams }: { params: Promise<{ farm: string }>; searchParams: Promise<CatalogSearchParams> }) {
  const [{ farm }, query] = await Promise.all([params, searchParams]);
  return <CatalogScreen farm={farm} resource="suppliers" searchParams={query} />;
}

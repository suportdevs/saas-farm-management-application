import type { Metadata } from 'next';
import { CatalogScreen, type CatalogSearchParams } from '@/modules/products/components/catalog-screen';

export const metadata: Metadata = { title: 'Customer types' };

/** Kinds of customers: /farms/<farm>/distribution/customer-types. */
export default async function CustomerTypesPage({ params, searchParams }: { params: Promise<{ farm: string }>; searchParams: Promise<CatalogSearchParams> }) {
  const [{ farm }, query] = await Promise.all([params, searchParams]);
  return <CatalogScreen farm={farm} resource="customer-types" searchParams={query} />;
}

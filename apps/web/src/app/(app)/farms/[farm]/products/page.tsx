import type { Metadata } from 'next';
import {
  CatalogScreen,
  type CatalogSearchParams,
} from '@/modules/products/components/catalog-screen';

export const metadata: Metadata = { title: 'Products' };

export default async function ProductsPage({
  params,
  searchParams,
}: {
  params: Promise<{ farm: string }>;
  searchParams: Promise<CatalogSearchParams>;
}) {
  const [{ farm }, query] = await Promise.all([params, searchParams]);
  return <CatalogScreen farm={farm} resource="products" searchParams={query} />;
}

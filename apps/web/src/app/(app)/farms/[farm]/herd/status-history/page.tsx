import type { Metadata } from 'next';
import { CatalogScreen, type CatalogSearchParams } from '@/modules/products/components/catalog-screen';

export const metadata: Metadata = { title: 'Status history' };

/** Herd status changes (in herd, sold, dead): /farms/<farm>/herd/status-history. */
export default async function StatusHistoryPage({ params, searchParams }: { params: Promise<{ farm: string }>; searchParams: Promise<CatalogSearchParams> }) {
  const [{ farm }, query] = await Promise.all([params, searchParams]);
  return <CatalogScreen farm={farm} resource="status-history" searchParams={query} />;
}

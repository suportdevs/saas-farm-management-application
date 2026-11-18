import type { Metadata } from 'next';
import { CatalogScreen, type CatalogSearchParams } from '@/modules/products/components/catalog-screen';

export const metadata: Metadata = { title: 'Pen types' };

/** Kinds of pens (Feedlot, Quarantine…): /farms/<farm>/herd/pen-types. */
export default async function PenTypesPage({ params, searchParams }: { params: Promise<{ farm: string }>; searchParams: Promise<CatalogSearchParams> }) {
  const [{ farm }, query] = await Promise.all([params, searchParams]);
  return <CatalogScreen farm={farm} resource="pen-types" searchParams={query} />;
}

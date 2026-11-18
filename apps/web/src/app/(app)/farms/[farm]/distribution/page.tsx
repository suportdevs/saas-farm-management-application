import { redirect } from 'next/navigation';

/** /farms/<farm>/distribution has no page of its own: open the suppliers. */
export default async function DistributionPage({ params }: { params: Promise<{ farm: string }> }) {
  const { farm } = await params;
  redirect(`/farms/${farm}/distribution/suppliers`);
}

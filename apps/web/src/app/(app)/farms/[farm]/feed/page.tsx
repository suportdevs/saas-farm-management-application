import { redirect } from 'next/navigation';

/** /farms/<farm>/feed has no page of its own yet: open the finish receives. */
export default async function Page({ params }: { params: Promise<{ farm: string }> }) {
  const { farm } = await params;
  redirect(`/farms/${farm}/feed/finish-receives`);
}

import { redirect } from 'next/navigation';

/** /farms/<farm>/hr has no page of its own: open the employees. */
export default async function Page({ params }: { params: Promise<{ farm: string }> }) {
  const { farm } = await params;
  redirect(`/farms/${farm}/hr/employees`);
}

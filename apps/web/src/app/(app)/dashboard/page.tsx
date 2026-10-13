import { redirect } from 'next/navigation';
import { getFarms } from '@/modules/farms/server';

/** Entry point after sign-in: reopen the last farm, or start onboarding. */
export default async function DashboardPage() {
  const farms = await getFarms();
  redirect(farms[0] ? `/farms/${farms[0].slug}` : '/onboarding');
}

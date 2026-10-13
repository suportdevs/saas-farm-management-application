import type { Metadata } from 'next';
import { requireUser } from '@/lib/session';
import { ReferralCard } from '@/modules/referrals/referral-card';

export const metadata: Metadata = { title: 'Referrals' };

export default async function ReferralsPage() {
  await requireUser();
  return <ReferralCard />;
}

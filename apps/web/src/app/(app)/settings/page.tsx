import type { Metadata } from 'next';
import { DeleteAccount } from '@/components/settings/delete-account';
import { EmailForm } from '@/components/settings/email-form';
import { ProfileForm } from '@/components/settings/profile-form';
import { requireUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Settings' };

export default async function ProfileSettingsPage() {
  const user = await requireUser();
  return (
    <>
      <ProfileForm user={user} />
      <EmailForm user={user} />
      <DeleteAccount hasPassword={user.hasPassword} />
    </>
  );
}

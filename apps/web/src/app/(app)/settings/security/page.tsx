import type { Metadata } from 'next';
import { ActivityList } from '@/components/settings/activity-list';
import { PasswordForm } from '@/components/settings/password-form';
import { SessionsList } from '@/components/settings/sessions-list';
import { requireUser } from '@/lib/session';
import { securitySections } from '@/modules/registry';

export const metadata: Metadata = { title: 'Security' };

export default async function SecuritySettingsPage() {
  const user = await requireUser();
  return (
    <>
      <PasswordForm hasPassword={user.hasPassword} />
      {/* Sections contributed by installed modules (two-factor, social-auth, …) */}
      {securitySections.map((Section, i) => (
        <Section key={i} user={user} />
      ))}
      <SessionsList />
      <ActivityList />
    </>
  );
}

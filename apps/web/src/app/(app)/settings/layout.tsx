import { PageHeader } from '@/components/app/page-header';
import { SettingsTabs } from '@/components/settings/settings-tabs';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PageHeader title="Settings" description="Manage your account settings and security." />
      <SettingsTabs />
      <div className="space-y-6">{children}</div>
    </>
  );
}

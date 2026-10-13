import type { Metadata } from 'next';
import { LegalPage } from '@/components/site/legal-page';
import { appName } from '@/lib/utils';

export const metadata: Metadata = { title: 'Privacy Policy' };

// TEMPLATE — replace with a policy reviewed by your legal counsel before launch.
export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="January 1, 2026">
      <p>This policy explains what personal data {appName} collects, why, and the choices you have.</p>
      <h2>What we collect</h2>
      <ul>
        <li>Account data: your name, email address and a hashed password.</li>
        <li>Security data: IP address, browser and device for sign-ins and active sessions.</li>
        <li>Billing data: handled by our payment processor; we never store full card numbers.</li>
        <li>Usage data: actions you take in the app, to operate and improve the Service.</li>
      </ul>
      <h2>How we use it</h2>
      <ul>
        <li>To provide and secure the Service, including fraud and abuse prevention.</li>
        <li>To send transactional emails (verification, password resets, security alerts, receipts).</li>
        <li>To comply with legal obligations.</li>
      </ul>
      <h2>Cookies</h2>
      <p>
        We use a strictly necessary, httpOnly session cookie to keep you signed in, and local storage to remember your
        theme. We don&apos;t use advertising cookies.
      </p>
      <h2>Sharing</h2>
      <p>
        We share data only with processors that help us run the Service (hosting, email delivery, payments), under
        contracts that protect it. We never sell personal data.
      </p>
      <h2>Retention</h2>
      <p>
        Account data is kept while your account exists. Security logs are kept for a limited period. Deleting your
        account removes your personal data, except where we must keep it by law.
      </p>
      <h2>Your rights</h2>
      <p>
        You can access and update your data in Settings, and delete your account at any time. Contact us to exercise any
        other right you have under applicable law (e.g. GDPR or CCPA).
      </p>
    </LegalPage>
  );
}

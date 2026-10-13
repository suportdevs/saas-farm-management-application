import type { Metadata } from 'next';
import { LegalPage } from '@/components/site/legal-page';
import { appName } from '@/lib/utils';

export const metadata: Metadata = { title: 'Terms of Service' };

// TEMPLATE — replace with terms reviewed by your legal counsel before launch.
export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="January 1, 2026">
      <p>
        These Terms govern your use of {appName} (the &quot;Service&quot;). By creating an account or using the Service you
        agree to them.
      </p>
      <h2>1. Accounts</h2>
      <p>
        You are responsible for your account, for keeping your credentials secure, and for all activity under it. You must
        provide accurate information and be at least 16 years old.
      </p>
      <h2>2. Acceptable use</h2>
      <ul>
        <li>Don&apos;t break the law or infringe anyone&apos;s rights.</li>
        <li>Don&apos;t attempt to disrupt, probe or reverse-engineer the Service.</li>
        <li>Don&apos;t send spam or malware, or resell the Service without permission.</li>
      </ul>
      <p>We may suspend accounts that violate these rules.</p>
      <h2>3. Subscriptions and payments</h2>
      <p>
        Paid plans renew automatically until cancelled. You can cancel at any time from your billing settings; access
        continues until the end of the current period. Fees are non-refundable except where required by law.
      </p>
      <h2>4. Your content</h2>
      <p>
        You keep ownership of the content you put into the Service and grant us the limited licence needed to operate it.
      </p>
      <h2>5. Termination</h2>
      <p>You can delete your account at any time from Settings. We may terminate access for violations of these Terms.</p>
      <h2>6. Disclaimers and liability</h2>
      <p>
        The Service is provided &quot;as is&quot;. To the maximum extent permitted by law, our total liability is limited to
        the amount you paid us in the 12 months before the claim.
      </p>
      <h2>7. Changes</h2>
      <p>We&apos;ll notify you of material changes by email or in the app before they take effect.</p>
    </LegalPage>
  );
}

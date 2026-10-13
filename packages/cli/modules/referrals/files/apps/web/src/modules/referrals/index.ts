import { defineWebModule } from '../types';
import { ReferralWidget } from './referral-card';

export default defineWebModule({
  name: 'referrals',
  settingsTabs: [{ href: '/settings/referrals', label: 'Referrals' }],
  dashboardWidgets: [ReferralWidget],
});

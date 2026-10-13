import { defineWebModule } from '../types';

export default defineWebModule({
  name: 'billing',
  settingsTabs: [{ href: '/settings/billing', label: 'Billing' }],
  publicNavItems: [{ href: '/pricing', label: 'Pricing' }],
});

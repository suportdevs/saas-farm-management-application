import { defineWebModule } from '../types';
import { ConnectedAccounts } from './connected-accounts';
import { SocialButtons } from './social-buttons';

export default defineWebModule({
  name: 'social-auth',
  authProviders: [SocialButtons],
  securitySections: [ConnectedAccounts],
});

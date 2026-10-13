import { defineWebModule } from '../types';
import { PasskeyLogin } from './passkey-login';
import { PasskeySettings } from './passkey-settings';

export default defineWebModule({
  name: 'passkeys',
  authProviders: [PasskeyLogin],
  securitySections: [PasskeySettings],
});

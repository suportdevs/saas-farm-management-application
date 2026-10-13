import { defineWebModule } from '../types';
import { EmailOtpSettings } from './email-otp-settings';

export default defineWebModule({
  name: 'email-otp',
  securitySections: [EmailOtpSettings],
  challenges: { 'email-otp': '/email-otp' },
});

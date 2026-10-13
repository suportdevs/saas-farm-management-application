import { defineWebModule } from '../types';
import { TwoFactorSettings } from './two-factor-settings';

export default defineWebModule({
  name: 'two-factor',
  securitySections: [TwoFactorSettings],
  challenges: { 'two-factor': '/two-factor' },
});

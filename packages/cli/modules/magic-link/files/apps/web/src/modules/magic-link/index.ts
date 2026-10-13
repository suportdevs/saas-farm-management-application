import { defineWebModule } from '../types';
import { MagicLinkForm } from './magic-link-form';

export default defineWebModule({
  name: 'magic-link',
  authProviders: [MagicLinkForm],
});

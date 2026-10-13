import { defineModule, schedule } from '../../core';
import { router } from './routes';
import { purgeExpiredLinks } from './service';

export default defineModule({
  name: 'magic-link',
  router,
  setup() {
    schedule('magic-link.purge', 60 * 60 * 1000, purgeExpiredLinks);
  },
});

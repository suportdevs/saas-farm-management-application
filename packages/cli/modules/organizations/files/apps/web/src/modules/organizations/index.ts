import { Building2 } from 'lucide-react';
import { defineWebModule } from '../types';

export default defineWebModule({
  name: 'organizations',
  navItems: [{ href: '/orgs', label: 'Organizations', icon: Building2 }],
});

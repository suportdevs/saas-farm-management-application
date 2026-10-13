import pc from 'picocolors';
import { generateRegistries } from '../lib/registry.mjs';

export function syncCommand() {
  const { api, web } = generateRegistries();
  console.log(pc.green('✔ Registries regenerated'));
  console.log(`  api: ${api.join(', ') || pc.dim('(none)')}`);
  console.log(`  web: ${web.join(', ') || pc.dim('(none)')}`);
}

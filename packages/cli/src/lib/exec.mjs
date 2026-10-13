import { spawnSync } from 'node:child_process';
import { root } from './project.mjs';

export function npm(args, opts = {}) {
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...opts,
  });
  return result.status === 0;
}

export const npmInstall = () => npm(['install', '--no-audit', '--no-fund']);

/** Generates a Drizzle migration reflecting the current set of module schemas. */
export const generateMigration = (name) =>
  npm(['run', 'db:generate', '-w', '@kit/api', '--', '--name', name.replace(/[^a-z0-9_]/gi, '_')]);

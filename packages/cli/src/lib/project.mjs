import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Directory containing module templates shipped with the CLI. */
export const MODULES_DIR = path.resolve(here, '../../modules');

/** Walks up from cwd to find the project root (the folder with kit.json). */
export function findRoot(start = process.cwd()) {
  let dir = start;
  while (true) {
    if (fs.existsSync(path.join(dir, 'kit.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error('Could not find kit.json — run this inside the starter kit project.');
    dir = parent;
  }
}

export const root = findRoot();
export const rel = (p) => path.relative(root, p).split(path.sep).join('/');
export const abs = (p) => path.join(root, p);

export const APPS = {
  api: { dir: 'apps/api', workspace: '@kit/api' },
  web: { dir: 'apps/web', workspace: '@kit/web' },
};

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function writeJson(file, data) {
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

export function readKitConfig() {
  const config = readJson(abs('kit.json'));
  config.modules ??= {};
  return config;
}

export function writeKitConfig(config) {
  writeJson(abs('kit.json'), config);
}

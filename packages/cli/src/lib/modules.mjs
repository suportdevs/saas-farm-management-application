import fs from 'node:fs';
import path from 'node:path';
import { MODULES_DIR, readJson } from './project.mjs';

/**
 * A module lives in packages/cli/modules/<name>/ with:
 *   module.json   manifest (see README "Writing a module")
 *   files/        a tree mirrored into the project root on install
 */
export function listAvailableModules() {
  if (!fs.existsSync(MODULES_DIR)) return [];
  return fs
    .readdirSync(MODULES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(MODULES_DIR, d.name, 'module.json')))
    .map((d) => loadModule(d.name))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function loadModule(name) {
  const dir = path.join(MODULES_DIR, name);
  const manifestPath = path.join(dir, 'module.json');
  if (!fs.existsSync(manifestPath)) return null;
  const manifest = readJson(manifestPath);
  return {
    requires: [],
    dependencies: {},
    devDependencies: {},
    env: [],
    notes: [],
    migration: false,
    ...manifest,
    dir,
    filesDir: path.join(dir, 'files'),
  };
}

export function requireModule(name) {
  const mod = loadModule(name);
  if (!mod) {
    const names = listAvailableModules().map((m) => m.name).join(', ');
    throw new Error(`Unknown module "${name}". Available: ${names || '(none)'}`);
  }
  return mod;
}

/** Lists files under a module's files/ dir as project-relative POSIX paths. */
export function moduleFiles(mod) {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(path.relative(mod.filesDir, full).split(path.sep).join('/'));
    }
  };
  if (fs.existsSync(mod.filesDir)) walk(mod.filesDir);
  return out.sort();
}

/** Resolves install order so that required modules come first. */
export function resolveInstallOrder(names) {
  const order = [];
  const visiting = new Set();
  const visit = (name, chain = []) => {
    if (order.some((m) => m.name === name)) return;
    if (visiting.has(name)) throw new Error(`Circular module dependency: ${[...chain, name].join(' → ')}`);
    visiting.add(name);
    const mod = requireModule(name);
    for (const dep of mod.requires) visit(dep, [...chain, name]);
    visiting.delete(name);
    order.push(mod);
  };
  for (const n of names) visit(n);
  return order;
}

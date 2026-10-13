import { APPS, abs, readJson, writeJson } from './project.mjs';
import { loadModule } from './modules.mjs';

const sortObject = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));

/** Adds a module's npm dependencies to the matching app package.json files. Returns true if anything changed. */
export function addDependencies(mod) {
  let changed = false;
  for (const field of ['dependencies', 'devDependencies']) {
    for (const [app, deps] of Object.entries(mod[field] ?? {})) {
      const file = abs(`${APPS[app].dir}/package.json`);
      const pkg = readJson(file);
      pkg[field] ??= {};
      for (const [name, version] of Object.entries(deps)) {
        if (pkg[field][name] !== version) {
          pkg[field][name] = version;
          changed = true;
        }
      }
      pkg[field] = sortObject(pkg[field]);
      writeJson(file, pkg);
    }
  }
  return changed;
}

/** Removes dependencies only this module needed (keeps ones other installed modules still use). */
export function removeDependencies(mod, remainingModuleNames) {
  const stillNeeded = new Set();
  for (const name of remainingModuleNames) {
    const other = loadModule(name);
    if (!other) continue;
    for (const field of ['dependencies', 'devDependencies']) {
      for (const [app, deps] of Object.entries(other[field] ?? {})) {
        for (const dep of Object.keys(deps)) stillNeeded.add(`${app}:${dep}`);
      }
    }
  }
  let changed = false;
  for (const field of ['dependencies', 'devDependencies']) {
    for (const [app, deps] of Object.entries(mod[field] ?? {})) {
      const file = abs(`${APPS[app].dir}/package.json`);
      const pkg = readJson(file);
      for (const dep of Object.keys(deps)) {
        if (!stillNeeded.has(`${app}:${dep}`) && pkg[field]?.[dep]) {
          delete pkg[field][dep];
          changed = true;
        }
      }
      writeJson(file, pkg);
    }
  }
  return changed;
}

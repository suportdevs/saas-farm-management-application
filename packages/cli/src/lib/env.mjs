import fs from 'node:fs';
import { abs } from './project.mjs';

const ENV_FILES = {
  api: ['apps/api/.env.example', 'apps/api/.env'],
  web: ['apps/web/.env.example', 'apps/web/.env.local'],
};

const start = (name) => `# >>> module:${name}`;
const end = (name) => `# <<< module:${name}`;

function stripBlock(content, name) {
  const re = new RegExp(`\\n?${escape(start(name))}[\\s\\S]*?${escape(end(name))}\\n?`, 'g');
  return content.replace(re, '\n');
}
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const quote = (v) => (v === '' || /^[\w./:@-]*$/.test(v) ? v : JSON.stringify(v));

/**
 * Adds a marked block of env vars for the module to each app's env files.
 * Existing values in .env are preserved when re-installing.
 */
export function addEnvBlock(mod) {
  const changed = [];
  for (const [app, files] of Object.entries(ENV_FILES)) {
    const vars = mod.env.filter((e) => (e.app ?? 'api') === app);
    if (!vars.length) continue;
    for (const file of files) {
      const path = abs(file);
      if (!fs.existsSync(path)) continue;
      let content = fs.readFileSync(path, 'utf8');
      const existing = Object.fromEntries(
        [...content.matchAll(/^([A-Z0-9_]+)=(.*)$/gm)].map((m) => [m[1], m[2]]),
      );
      content = stripBlock(content, mod.name).trimEnd();
      const lines = [start(mod.name)];
      for (const v of vars) {
        if (v.description) lines.push(`# ${v.description}`);
        const isRealEnv = !file.endsWith('.example');
        const value = isRealEnv && existing[v.key] !== undefined ? existing[v.key] : quote(v.example ?? '');
        lines.push(`${v.key}=${value}`);
      }
      lines.push(end(mod.name));
      fs.writeFileSync(path, `${content}\n\n${lines.join('\n')}\n`);
      changed.push(file);
    }
  }
  return changed;
}

export function removeEnvBlock(mod) {
  const changed = [];
  for (const files of Object.values(ENV_FILES)) {
    for (const file of files) {
      const path = abs(file);
      if (!fs.existsSync(path)) continue;
      const before = fs.readFileSync(path, 'utf8');
      const after = `${stripBlock(before, mod.name).trimEnd()}\n`;
      if (after !== before) {
        fs.writeFileSync(path, after);
        changed.push(file);
      }
    }
  }
  return changed;
}

import pc from 'picocolors';
import { moduleFiles, requireModule } from '../lib/modules.mjs';
import { readKitConfig } from '../lib/project.mjs';

export function infoCommand(name) {
  if (!name) throw new Error('Usage: kit info <module>');
  const mod = requireModule(name);
  const installed = readKitConfig().modules[name];

  console.log(`\n${pc.bold(mod.title ?? mod.name)} ${pc.dim(`(${mod.name}@${mod.version ?? '0.0.0'})`)}`);
  console.log(`${mod.description}\n`);
  console.log(`${pc.bold('Status:')}    ${installed ? pc.green(`installed ${installed.installedAt}`) : 'not installed'}`);
  if (mod.requires.length) console.log(`${pc.bold('Requires:')}  ${mod.requires.join(', ')}`);
  console.log(`${pc.bold('Migration:')} ${mod.migration ? 'yes' : 'no'}`);

  for (const field of ['dependencies', 'devDependencies']) {
    for (const [app, deps] of Object.entries(mod[field])) {
      const list = Object.entries(deps).map(([d, v]) => `${d}@${v}`).join(', ');
      if (list) console.log(`${pc.bold(`${field} (${app}):`)} ${list}`);
    }
  }
  if (mod.env.length) {
    console.log(`\n${pc.bold('Environment variables')}`);
    for (const e of mod.env) console.log(`  ${pc.cyan(e.key)}${e.description ? pc.dim(` — ${e.description}`) : ''}`);
  }
  console.log(`\n${pc.bold('Files')}`);
  for (const f of moduleFiles(mod)) console.log(`  ${f}`);
  if (mod.notes.length) {
    console.log(`\n${pc.bold('Notes')}`);
    for (const n of mod.notes) console.log(`  • ${n}`);
  }
  console.log();
}

import fs from 'node:fs';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { removeDependencies } from '../lib/deps.mjs';
import { removeEnvBlock } from '../lib/env.mjs';
import { generateMigration, npmInstall } from '../lib/exec.mjs';
import { hashFile, removeFile } from '../lib/fs.mjs';
import { loadModule } from '../lib/modules.mjs';
import { abs, readKitConfig, root, writeKitConfig } from '../lib/project.mjs';
import { generateRegistries } from '../lib/registry.mjs';

export async function removeCommand(names, options) {
  p.intro(pc.bgRed(pc.white(' kit remove ')));
  if (!names.length) throw new Error('Usage: kit remove <module...>');
  const config = readKitConfig();

  for (const name of names) {
    if (!config.modules[name]) throw new Error(`Module "${name}" is not installed.`);
    const dependents = Object.keys(config.modules).filter(
      (other) => !names.includes(other) && loadModule(other)?.requires.includes(name),
    );
    if (dependents.length) throw new Error(`Cannot remove "${name}": required by ${dependents.join(', ')}. Remove those first.`);
  }

  // Detect local edits so we never silently destroy user changes.
  const modified = names.flatMap((n) =>
    Object.entries(config.modules[n].files)
      .filter(([f, hash]) => fs.existsSync(abs(f)) && hashFile(abs(f)) !== hash)
      .map(([f]) => f),
  );
  if (modified.length && !options.force) {
    p.log.warn(`These files were modified since install:\n${modified.map((f) => `  ${f}`).join('\n')}`);
    if (options.yes) throw new Error('Aborting. Re-run with --force to delete them anyway.');
    const ok = await p.confirm({ message: 'Delete them anyway?', initialValue: false });
    if (p.isCancel(ok) || !ok) return p.cancel('Cancelled');
  }

  if (!options.yes) {
    const ok = await p.confirm({
      message: `Remove ${names.map((n) => pc.cyan(n)).join(', ')}? Module tables will be dropped by the next migration.`,
    });
    if (p.isCancel(ok) || !ok) return p.cancel('Cancelled');
  }

  let depsChanged = false;
  let schemaChanged = false;
  for (const name of names) {
    const mod = loadModule(name);
    for (const file of Object.keys(config.modules[name].files)) removeFile(abs(file), root);
    delete config.modules[name];
    writeKitConfig(config);
    if (mod) {
      depsChanged = removeDependencies(mod, Object.keys(config.modules)) || depsChanged;
      removeEnvBlock(mod);
      schemaChanged ||= mod.migration;
    }
    p.log.success(`Removed ${pc.cyan(name)}`);
  }

  generateRegistries();
  p.log.success('Registries updated');

  if (depsChanged && !options.skipInstall) {
    p.log.step('Updating dependencies…');
    npmInstall();
  }
  if (schemaChanged) {
    if (options.skipMigration) p.log.warn('Run `npm run db:generate` to create a migration dropping the module tables.');
    else if (generateMigration(`remove_${names.join('_')}`)) p.log.info(`Apply it with ${pc.bold('npm run db:migrate')}`);
  }
  p.outro(pc.green('Done!'));
}

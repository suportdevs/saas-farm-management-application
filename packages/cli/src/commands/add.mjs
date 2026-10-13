import fs from 'node:fs';
import path from 'node:path';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { addDependencies } from '../lib/deps.mjs';
import { addEnvBlock } from '../lib/env.mjs';
import { generateMigration, npmInstall } from '../lib/exec.mjs';
import { copyFile, hashFile } from '../lib/fs.mjs';
import { listAvailableModules, moduleFiles, resolveInstallOrder } from '../lib/modules.mjs';
import { abs, readKitConfig, writeKitConfig } from '../lib/project.mjs';
import { generateRegistries } from '../lib/registry.mjs';

export async function addCommand(names, options) {
  p.intro(pc.bgCyan(pc.black(' kit add ')));
  const config = readKitConfig();

  if (!names.length) {
    const choices = listAvailableModules().filter((m) => !config.modules[m.name]);
    if (!choices.length) {
      p.outro('All available modules are already installed.');
      return;
    }
    if (options.yes) throw new Error('Specify module names in non-interactive mode, e.g. `kit add two-factor`');
    const picked = await p.multiselect({
      message: 'Which modules do you want to install?',
      options: choices.map((m) => ({ value: m.name, label: m.title ?? m.name, hint: m.description })),
      required: true,
    });
    if (p.isCancel(picked)) return p.cancel('Cancelled');
    names = picked;
  }

  const plan = resolveInstallOrder(names).filter((m) => !config.modules[m.name]);
  if (!plan.length) {
    p.outro(`${names.join(', ')} ${names.length > 1 ? 'are' : 'is'} already installed.`);
    return;
  }

  const implicit = plan.filter((m) => !names.includes(m.name));
  if (implicit.length) p.log.info(`Also installing required modules: ${implicit.map((m) => pc.cyan(m.name)).join(', ')}`);

  // Refuse to clobber files that already exist unless --force.
  const conflicts = plan.flatMap((m) => moduleFiles(m).filter((f) => fs.existsSync(abs(f))));
  if (conflicts.length && !options.force) {
    p.log.error(`These files already exist:\n${conflicts.map((f) => `  ${f}`).join('\n')}`);
    throw new Error('Aborting. Re-run with --force to overwrite them.');
  }

  let depsChanged = false;
  const migrations = [];
  const notes = [];

  for (const mod of plan) {
    const s = p.spinner();
    s.start(`Installing ${mod.name}`);
    const files = {};
    for (const file of moduleFiles(mod)) {
      copyFile(path.join(mod.filesDir, file), abs(file));
      files[file] = hashFile(abs(file));
    }
    depsChanged = addDependencies(mod) || depsChanged;
    const envFiles = addEnvBlock(mod);

    config.modules[mod.name] = {
      version: mod.version ?? '0.0.0',
      installedAt: new Date().toISOString(),
      files,
    };
    writeKitConfig(config);
    if (mod.migration) migrations.push(mod.name);
    notes.push(...mod.notes.map((n) => `${pc.cyan(mod.name)}: ${n}`));
    s.stop(
      `Installed ${pc.cyan(mod.name)} ${pc.dim(`(${Object.keys(files).length} files${envFiles.length ? `, env → ${envFiles.join(', ')}` : ''})`)}`,
    );
  }

  const { api, web } = generateRegistries();
  p.log.success(`Registries updated — api: [${api.join(', ')}] web: [${web.join(', ')}]`);

  if (depsChanged) {
    if (options.skipInstall) p.log.warn('Dependencies changed — run `npm install` to install them.');
    else {
      p.log.step('Installing dependencies…');
      if (!npmInstall()) throw new Error('npm install failed');
    }
  }

  if (migrations.length) {
    if (options.skipMigration) {
      p.log.warn('Schema changed — run `npm run db:generate` and `npm run db:migrate`.');
    } else {
      p.log.step('Generating database migration…');
      if (!generateMigration(`add_${migrations.join('_')}`)) {
        p.log.warn('Migration generation failed — fix the issue and run `npm run db:generate`.');
      } else {
        notes.unshift(`Apply the new migration: ${pc.bold('npm run db:migrate')}`);
      }
    }
  }

  if (notes.length) p.note(notes.join('\n'), 'Next steps');
  p.outro(pc.green('Done! Restart your dev server to load the new module.'));
}

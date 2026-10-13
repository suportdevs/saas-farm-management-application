import pc from 'picocolors';
import { listAvailableModules } from '../lib/modules.mjs';
import { readKitConfig } from '../lib/project.mjs';

export function listCommand() {
  const installed = readKitConfig().modules;
  const modules = listAvailableModules();
  if (!modules.length) return console.log('No modules available.');

  const width = Math.max(...modules.map((m) => m.name.length)) + 2;
  console.log(`\n${pc.bold('Available modules')}\n`);
  for (const m of modules) {
    const mark = installed[m.name] ? pc.green('● installed') : pc.dim('○');
    console.log(`  ${pc.cyan(m.name.padEnd(width))}${m.description}  ${mark}`);
  }
  console.log(`\n  Install with ${pc.bold('npm run kit add <module>')}\n`);
}

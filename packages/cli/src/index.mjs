import { parseArgs } from 'node:util';
import pc from 'picocolors';
import { addCommand } from './commands/add.mjs';
import { infoCommand } from './commands/info.mjs';
import { listCommand } from './commands/list.mjs';
import { removeCommand } from './commands/remove.mjs';
import { syncCommand } from './commands/sync.mjs';

const HELP = `
${pc.bold('kit')} — manage starter-kit feature modules

${pc.bold('Usage')}
  npm run kit <command> [options]

${pc.bold('Commands')}
  list                     Show available and installed modules
  info <module>            Show details about a module
  add [module...]          Install one or more modules (interactive if none given)
  remove <module...>       Uninstall modules
  sync                     Regenerate module registries from kit.json

${pc.bold('Options')}
  --skip-install           Don't run npm install
  --skip-migration         Don't generate a database migration
  --force                  Overwrite / delete files even if they were modified
  -y, --yes                Answer yes to all prompts
  -h, --help               Show this help

${pc.bold('Examples')}
  npm run kit add two-factor
  npm run kit add billing organizations
  npm run kit add social-auth -- --skip-install
  npm run kit remove two-factor
`;

export async function run(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      'skip-install': { type: 'boolean', default: false },
      'skip-migration': { type: 'boolean', default: false },
      force: { type: 'boolean', default: false },
      yes: { type: 'boolean', short: 'y', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  const [command, ...args] = positionals;
  const options = {
    skipInstall: values['skip-install'],
    skipMigration: values['skip-migration'],
    force: values.force,
    yes: values.yes || !process.stdin.isTTY,
  };

  if (values.help || !command) return console.log(HELP);

  switch (command) {
    case 'list':
    case 'ls':
      return listCommand();
    case 'info':
      return infoCommand(args[0]);
    case 'add':
    case 'install':
      return addCommand(args, options);
    case 'remove':
    case 'rm':
    case 'uninstall':
      return removeCommand(args, options);
    case 'sync':
      return syncCommand();
    default:
      console.log(HELP);
      throw new Error(`Unknown command "${command}"`);
  }
}

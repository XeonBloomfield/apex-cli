'use strict';

const { runInit, runList } = require('./init');

const VERSION = require('../package.json').version;

const HELP = `apex — configure your AI coding assistants to use Callstack Apex

Usage:
  apex init [options]     Detect installed assistants and configure them
  apex list               Show which supported assistants are detected
  apex --help             Show this help
  apex --version          Show the CLI version

Options for "init":
  --api-key <key>   Apex API key (else reads APEX_API_KEY / CALLSTACK_AUTH_TOKEN, else prompts)
  --yes, -y         Don't prompt; skip anything that needs interactive input
  --dry-run         Show what would change without writing any files
  --only <ids>      Comma-separated assistant ids to limit to (see "apex list")
  --skip <ids>      Comma-separated assistant ids to skip
`;

function parseArgs(argv) {
  const opts = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--api-key':
        opts.apiKey = argv[++i];
        break;
      case '--only':
        opts.only = (argv[++i] || '').split(',').filter(Boolean);
        break;
      case '--skip':
        opts.skip = (argv[++i] || '').split(',').filter(Boolean);
        break;
      case '--yes':
      case '-y':
        opts.yes = true;
        break;
      case '--dry-run':
        opts.dryRun = true;
        break;
      case '--no-key':
        opts.noKey = true;
        break;
      case '--help':
      case '-h':
        opts.help = true;
        break;
      case '--version':
      case '-v':
        opts.version = true;
        break;
      default:
        opts._.push(arg);
    }
  }
  return opts;
}

async function main(argv) {
  const opts = parseArgs(argv);

  if (opts.version) {
    console.log(VERSION);
    return;
  }
  if (opts.help || opts._.length === 0) {
    console.log(HELP);
    return;
  }

  const command = opts._[0];
  switch (command) {
    case 'init':
      await runInit(opts);
      break;
    case 'list':
      await runList(opts);
      break;
    default:
      console.error(`Unknown command: ${command}\n`);
      console.log(HELP);
      process.exitCode = 1;
  }
}

module.exports = { main, parseArgs };

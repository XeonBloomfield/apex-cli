#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline/promises';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { detect, IDS, MANUAL, planAssistant, launchOptions, executable } from '../src/assistants.js';
import { readConfig, writeChange } from '../src/config.js';

const help = `Apex — configure AI assistants for callstack/Apex

Usage:
  apex init [--assistants codex,claude,opencode,pi,cursor,copilot] [--yes] [--dry-run]
  apex detect
  apex run <codex|claude|opencode|pi> [-- assistant arguments]

init detects binaries and configuration directories, previews file paths, then asks
before writing. --assistants explicitly selects tools, even if not detected.
--yes approves configuration changes; --dry-run never writes or prints secrets.
Existing files get private backups. API keys are never written to disk.
Set CALLSTACK_AUTH_TOKEN before starting an assistant. Run init first.
Cursor and VS Code/Copilot receive manual setup instructions only.
Node.js 22+ required. Codex profiles target 0.134.0+.
`;

async function main(argv) {
  const [command, ...rest] = argv;
  if (!command || ['--help', '-h', 'help'].includes(command)) { console.log(help); return; }
  if (['--version', '-v'].includes(command)) {
    console.log(JSON.parse(await readFile(new URL('../package.json', import.meta.url))).version);
    return;
  }
  if (command === 'run') {
    const [id, ...passed] = rest;
    if (!['codex', 'claude', 'opencode', 'pi'].includes(id)) throw new Error('Choose a supported CLI assistant; see apex --help.');
    const options = launchOptions(id);
    const binary = await executable(id);
    if (!binary) throw new Error(`${id} was not found on PATH. Install it first.`);
    if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(binary)) {
      throw new Error('Windows .cmd/.bat launchers are not executed through a shell. Use WSL or launch the configured assistant directly.');
    }
    const args = passed[0] === '--' ? passed.slice(1) : passed;
    const child = spawn(binary, [...options.args, ...args], { env: options.env, stdio: 'inherit', shell: false });
    await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => { process.exitCode = code ?? (signal === 'SIGINT' ? 130 : 1); resolve(); });
    });
    return;
  }
  if (!['init', 'detect'].includes(command)) throw new Error(`Unknown command: ${command}. See apex --help.`);
  const { values, positionals } = parseArgs({ args: rest, options: {
    assistants: { type: 'string' }, yes: { type: 'boolean', short: 'y' },
    'dry-run': { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
  }, allowPositionals: true });
  if (values.help) { console.log(help); return; }
  if (positionals.length) throw new Error('Unexpected arguments. See apex --help.');
  if (command === 'detect' && Object.keys(values).length) throw new Error('detect accepts no options.');
  let selected;
  if (values.assistants !== undefined) {
    selected = [...new Set(values.assistants.split(',').map(value => value.trim()))];
    if (selected.some(id => !IDS.includes(id))) throw new Error(`Supported assistants: ${IDS.join(', ')}`);
  }
  const assistants = await detect();
  for (const assistant of assistants) {
    console.log(`${assistant.detected ? 'Detected' : 'Not found'}: ${assistant.id}${assistant.evidence ? ` (${assistant.evidence})` : ''}`);
  }
  if (command === 'detect') return;
  const targets = assistants.filter(assistant => selected ? selected.includes(assistant.id) : assistant.detected);
  if (!targets.length) { console.log('No assistants detected. Install one, or choose explicitly with --assistants.'); return; }
  const changes = [];
  for (const target of targets) changes.push(...await planAssistant(target));
  const pending = changes.filter(change => change.before !== change.after);
  for (const change of changes) console.log(`${change.before === change.after ? 'Unchanged' : change.before === null ? 'Create' : 'Update'}: ${change.path}`);
  for (const target of targets) if (MANUAL[target.id]) console.log(`\n${MANUAL[target.id]}`);
  console.log('\nAuthentication: set CALLSTACK_AUTH_TOKEN in your shell or secret manager. No key is stored by Apex.');
  if (values['dry-run']) { console.log('Dry run complete. No files changed.'); return; }
  if (pending.length && !values.yes) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Non-interactive init needs --yes. Preview first with --dry-run.');
    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    let answer;
    try { answer = await prompt.question(`\nApply ${pending.length} file change(s), backing up existing files? [y/N] `); }
    finally { prompt.close(); }
    if (!['y', 'yes'].includes(answer.trim().toLowerCase())) { console.log('Cancelled. No files changed.'); return; }
  }
  for (const change of pending) {
    if (await readConfig(change.path) !== change.before) throw new Error(`Configuration changed: ${change.path}. Run init again.`);
  }
  for (const change of pending) {
    const backup = await writeChange(change);
    console.log(`Saved: ${change.path}${backup ? `\nBackup: ${backup}` : ''}`);
  }
  for (const target of targets) if (!MANUAL[target.id]) console.log(`Start with: apex run ${target.id} (or npx @callstack/apex run ${target.id})`);
  console.log(pending.length ? 'Setup complete. Restart assistants to reload configuration.' : 'Configuration is already up to date.');
}

main(process.argv.slice(2)).catch(error => {
  console.error(`Apex: ${error.message}`);
  process.exitCode = 1;
});

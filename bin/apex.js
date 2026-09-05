#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline/promises';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { detect, IDS, MANUAL, launchOptions, executable } from '../src/assistants.js';
import { compatibility, credentialInstructions, consoleUrl, openConsole, redact } from '../src/onboarding.js';
import { planSetup, applySetup } from '../src/setup.js';
import { checkGateway, TRANSPORTS } from '../src/diagnostics.js';

const help = `Apex — configure AI assistants for callstack/Apex

Usage:
  apex init [--assistants codex,claude,opencode,pi,cursor,copilot] [--yes] [--dry-run] [--skip-invalid]
  apex detect
  apex auth [--open]
  apex doctor [--assistants codex,pi] [--live --yes] [--transport chat-completions|responses|anthropic]
  apex run <codex|claude|opencode|pi> [-- assistant arguments]

init lets you choose detected assistants and confirms writes. --assistants explicitly
selects tools, even if not installed. Noninteractive writes require --yes.
--skip-invalid explicitly permits valid tools to proceed; skipped/failed tools exit 1.
--dry-run never writes, opens browsers, runs version probes, or makes network requests.
Existing files get private backups. API keys and shell profiles are never saved.
auth shows browser/key instructions; --open opens the Console but does not create a key.
doctor makes no network requests unless --live is passed. Live checks may consume credit
and require confirmation or --yes. --transport defaults to chat-completions.
Set CALLSTACK_AUTH_TOKEN before starting an assistant. Run init first.
APEX_CONSOLE_URL can override the Console origin. Node.js 22+ is required.
`;

const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);

async function question(text) {
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try { return (await prompt.question(text)).trim(); } finally { prompt.close(); }
}

async function confirm(text) {
  return ['y', 'yes'].includes((await question(`${text} [y/N] `)).toLowerCase());
}

async function browserHandoff() {
  console.log(`Open: ${consoleUrl()}`);
  try { await openConsole(); }
  catch { console.log('Could not open a browser. Open the printed URL manually.'); }
}

function selectedIds(value) {
  const ids = [...new Set(value.split(',').map(id => id.trim()))];
  if (!ids.length || ids.some(id => !IDS.includes(id))) throw new Error(`Supported assistants: ${IDS.join(', ')}`);
  return ids;
}

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
    if (!binary) throw new Error(`${id} was not found on PATH. Install it first; run apex doctor for setup checks.`);
    if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(binary)) throw new Error('Windows .cmd/.bat launchers are not executed through a shell. Use WSL or launch the configured assistant directly.');
    const args = passed[0] === '--' ? passed.slice(1) : passed;
    const child = spawn(binary, [...options.args, ...args], { env: options.env, stdio: 'inherit', shell: false });
    await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => { process.exitCode = code ?? (signal === 'SIGINT' ? 130 : 1); resolve(); });
    });
    return;
  }
  const options = {
    init: { assistants: { type: 'string' }, yes: { type: 'boolean', short: 'y' }, 'dry-run': { type: 'boolean' }, 'skip-invalid': { type: 'boolean' } },
    detect: {}, auth: { open: { type: 'boolean' } },
    doctor: { assistants: { type: 'string' }, live: { type: 'boolean' }, yes: { type: 'boolean', short: 'y' }, transport: { type: 'string' } },
  };
  if (!Object.hasOwn(options, command)) throw new Error(`Unknown command: ${command}. See apex --help.`);
  const { values } = parseArgs({ args: rest, options: { ...options[command], help: { type: 'boolean', short: 'h' } } });
  if (values.help) { console.log(help); return; }
  if (command === 'auth') {
    console.log(credentialInstructions());
    if (values.open) await browserHandoff();
    return;
  }
  if (values.transport && !TRANSPORTS.includes(values.transport)) throw new Error(`Choose a transport: ${TRANSPORTS.join(', ')}`);
  if (values.transport && !values.live) throw new Error('--transport requires --live. Local checks do not contact the gateway.');
  let selected = values.assistants === undefined ? null : selectedIds(values.assistants);
  const assistants = await detect();
  for (const assistant of assistants) console.log(`${assistant.detected ? assistant.binary ? 'Executable found' : 'Installation/configuration evidence' : 'Not found'}: ${assistant.id}${assistant.evidence ? ` (${assistant.evidence})` : ''}`);
  if (command === 'detect') return;
  if (command === 'init' && !selected && interactive && !values.yes && !values['dry-run']) {
    const detected = assistants.filter(assistant => assistant.detected).map(assistant => assistant.id);
    if (detected.length) {
      const answer = await question(`Choose assistants (comma-separated: ${detected.join(', ')}; Enter cancels): `);
      if (!answer) { console.log('Cancelled. No files changed.'); return; }
      selected = selectedIds(answer);
    }
  }
  const targets = assistants.filter(assistant => selected ? selected.includes(assistant.id) : assistant.detected);
  const capabilities = new Map();
  if (!values['dry-run']) {
    for (const target of targets) {
      const capability = await compatibility(target);
      capabilities.set(target.id, capability);
      console.log(`${target.id}: ${capability.state} — ${capability.detail}`);
    }
  }
  const plans = await planSetup(targets);
  for (const plan of plans) {
    const capability = capabilities.get(plan.assistant.id);
    if (capability?.state === 'unsupported') plan.error = capability.detail;
    if (plan.error) console.log(`Cannot configure ${plan.assistant.id}: ${plan.error}`);
    else for (const change of plan.changes) console.log(`${change.before === change.after ? 'Unchanged' : change.before === null ? 'Create' : 'Update'}: ${change.path}`);
    if (MANUAL[plan.assistant.id]) console.log(`\n${MANUAL[plan.assistant.id]}`);
  }
  const hasToken = Boolean(process.env.CALLSTACK_AUTH_TOKEN?.trim());
  console.log(hasToken ? '\nCredentials: CALLSTACK_AUTH_TOKEN is set; validity has not been checked.' : `\nCredentials missing. ${credentialInstructions()}`);
  if (process.env.OPENCODE_CONFIG || process.env.OPENCODE_CONFIG_CONTENT) console.log('Warning: custom OpenCode configuration may override these global settings.');
  console.log('Project settings and stored assistant credentials may override global configuration; use apex run to select Apex.');
  if (command === 'doctor') {
    const incomplete = !targets.length || !hasToken || plans.some(plan => plan.error || !plan.changes.length || plan.changes.some(change => change.before !== change.after)) || [...capabilities.values()].some(item => ['missing', 'unsupported', 'unknown', 'manual'].includes(item.state));
    if (incomplete) process.exitCode = 1;
    console.log(incomplete ? 'Local setup needs attention. Run init for the selected tools or follow their manual guide.' : 'Local checks passed. Gateway access is not yet verified.');
    if (values.live) {
      if (!values.yes && (!interactive || !await confirm('Send a minimal request to api.callstack.ai? This uses your API key and may consume credit.'))) {
        console.log('Live check not performed. Noninteractive live checks require --yes.');
        process.exitCode = 1;
        return;
      }
      const result = await checkGateway(process.env.CALLSTACK_AUTH_TOKEN, values.transport);
      console.log(`Gateway: ${result.category} — ${result.message}`);
      if (!result.ok) process.exitCode = 1;
    } else console.log('Optional: apex doctor --live (may consume credit). Select --transport responses for Codex or anthropic for Claude.');
    return;
  }
  if (values['dry-run']) {
    console.log('Dry run complete. No files changed. Installed versions and gateway access were not checked.');
    if (plans.some(plan => plan.error)) process.exitCode = 1;
    return;
  }
  if (!targets.length) {
    console.log('No assistants selected or detected. Install one or use --assistants to prepare its configuration.');
    process.exitCode = 1;
    return;
  }
  const invalid = plans.filter(plan => plan.error);
  if (invalid.length && !values['skip-invalid']) {
    if (!interactive || values.yes || !await confirm(`Skip ${invalid.map(plan => plan.assistant.id).join(', ')} and continue with valid assistants?`)) throw new Error('No files changed. Select only valid assistants or explicitly use --skip-invalid to permit partial setup.');
  }
  const pending = plans.filter(plan => !plan.error).flatMap(plan => plan.changes).filter(change => change.before !== change.after);
  if (pending.length && !values.yes) {
    if (!interactive) throw new Error('Non-interactive init needs --yes. Preview first with --dry-run.');
    if (!await confirm(`Apply ${pending.length} file change(s), backing up existing files?`)) { console.log('Cancelled. No files changed.'); return; }
  }
  const results = await applySetup(plans, change => console.log(`Saved: ${change.path}${change.backup ? `\nBackup: ${change.backup}` : ''}`));
  for (const result of results) {
    console.log(`${result.id}: ${result.state}${result.error ? ` — ${result.error}` : ''}`);
    if (['configured', 'unchanged'].includes(result.state)) console.log(`Launch after credentials are set: npx @callstack/apex run ${result.id}`);
  }
  if (results.some(result => ['failed', 'skipped'].includes(result.state))) {
    process.exitCode = 1;
    console.log('Partial setup. Successful writes remain applied; restore printed backups to undo them.');
  }
  console.log('Configuration step finished. Manual steps, credentials, installed tools, and gateway access must be checked separately.');
  if (!hasToken && interactive && !values.yes && await confirm('Open the Developer Console to get or manage a key?')) await browserHandoff();
}

main(process.argv.slice(2)).catch(error => {
  console.error(`Apex: ${redact(error.message)}`);
  process.exitCode = 1;
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, stat, symlink, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parse as parseToml } from 'smol-toml';
import { detect, locations, planAssistant, launchOptions, MODEL } from '../src/assistants.js';
import { editJson, parseJson, addToml, readConfig, writeChange } from '../src/config.js';

async function fixture(context) {
  const home = await realpath(await mkdtemp(join(tmpdir(), 'apex-test-')));
  context.after(() => rm(home, { recursive: true, force: true }));
  const env = { ...process.env, HOME: home, USERPROFILE: home, PATH: '',
    CODEX_HOME: join(home, '.codex'), CLAUDE_CONFIG_DIR: join(home, '.claude'),
    PI_CODING_AGENT_DIR: join(home, '.pi', 'agent'), XDG_CONFIG_HOME: join(home, '.config'),
    APPDATA: join(home, 'AppData', 'Roaming'), CALLSTACK_AUTH_TOKEN: 'secret-test-token' };
  return { home, env };
}

function cli(args, env) {
  return spawnSync(process.execPath, [resolve('bin/apex.js'), ...args], { env, encoding: 'utf8' });
}

test('JSONC edits preserve comments, unrelated settings and existing provider models', () => {
  const before = '{\n  // keep this\n  "theme": "dark",\n  "provider": {"other": {"name": "Other"}},\n}\n';
  const after = editJson(before, [[['provider', 'callstack.ai', 'models', MODEL], { name: 'Apex' }]], 'test');
  assert.match(after, /\/\/ keep this/);
  assert.equal(parseJson(after).theme, 'dark');
  assert.deepEqual(parseJson(after).provider.other, { name: 'Other' });
  assert.equal(editJson(after, [[['provider', 'callstack.ai', 'models', MODEL], { name: 'Apex' }]], 'test'), after);
});

test('malformed and incompatible JSON is refused', () => {
  for (const before of ['{ broken', '[]', 'null', '{"provider": []}']) {
    assert.throws(() => editJson(before, [[['provider', 'callstack.ai'], {}]], 'fixture'));
  }
});

test('TOML preserves comments and root settings while adding tables', () => {
  const before = '# keep\nmodel = "callstack/Apex"\n[features]\nthing = true\n';
  const desired = { model: MODEL, model_provider: 'callstack_ai', model_providers: { callstack_ai: { name: 'callstack.ai' } } };
  const after = addToml(before, desired, 'test');
  assert.match(after, /# keep/);
  assert.deepEqual(parseToml(after), { ...desired, features: { thing: true } });
  assert.equal(addToml(after, desired, 'test'), after);
  assert.throws(() => addToml('model = "other"', desired, 'test'), /Conflicting/);
  assert.throws(() => addToml('invalid = [', desired, 'test'), /Invalid TOML/);
});

test('detection uses executable files and config directories without executing binaries', async context => {
  const { home, env } = await fixture(context);
  const bin = join(home, 'bin');
  await mkdir(bin);
  await writeFile(join(bin, 'pi'), '#!/bin/sh\nexit 91\n', { mode: 0o755 });
  await writeFile(join(bin, 'claude'), 'not executable', { mode: 0o600 });
  await mkdir(env.CODEX_HOME);
  const result = await detect({ home, env: { ...env, PATH: bin }, platform: 'linux' });
  assert.equal(result.find(item => item.id === 'pi').detected, true);
  assert.equal(result.find(item => item.id === 'claude').detected, false);
  assert.equal(result.find(item => item.id === 'codex').detected, true);
  assert.equal(result.find(item => item.id === 'cursor').detected, false);
});

test('platform locations respect Windows and environment overrides', () => {
  const paths = locations('/home/test', { APPDATA: '/roaming', CODEX_HOME: '/custom/codex', XDG_CONFIG_HOME: '/xdg' }, 'win32');
  assert.equal(paths.cursor, join('/roaming', 'Cursor'));
  assert.equal(paths.opencode, join('/xdg', 'opencode'));
  assert.equal(paths.codex, '/custom/codex');
});

test('all automatic adapters configure and repeat without changing files', async context => {
  const { home, env } = await fixture(context);
  const paths = locations(home, env);
  for (const id of ['codex', 'claude', 'opencode', 'pi']) {
    const assistant = { id, directory: paths[id] };
    for (const change of await planAssistant(assistant)) {
      await writeChange(change);
      assert.equal((await stat(change.path)).mode & 0o777, 0o600);
      assert.ok(!(await readFile(change.path, 'utf8')).includes(env.CALLSTACK_AUTH_TOKEN));
    }
    const again = await planAssistant(assistant);
    assert.ok(again.every(change => change.before === change.after), id);
  }
  const codex = parseToml(await readFile(join(paths.codex, 'callstack_ai.config.toml'), 'utf8'));
  assert.equal(codex.model, MODEL);
  assert.equal(codex.model_providers.callstack_ai.wire_api, 'responses');
  const pi = parseJson(await readFile(join(paths.pi, 'models.json'), 'utf8'));
  assert.equal(pi.providers.callstack.apiKey, '$CALLSTACK_AUTH_TOKEN');
});

test('Pi keeps other providers and models', async context => {
  const { home, env } = await fixture(context);
  const directory = locations(home, env).pi;
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'models.json'), JSON.stringify({ providers: {
    other: { models: [{ id: 'other' }] }, callstack: { models: [{ id: 'legacy' }] },
  } }));
  const [change] = await planAssistant({ id: 'pi', directory });
  const value = parseJson(change.after);
  assert.equal(value.providers.other.models[0].id, 'other');
  assert.deepEqual(value.providers.callstack.models, [{ id: 'legacy' }, { id: MODEL }]);
});

test('OpenCode JSONC is edited in place; ambiguous or v2 config is refused', async context => {
  const { home, env } = await fixture(context);
  const directory = locations(home, env).opencode;
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'opencode.jsonc'), '{ // preserved\n "theme": "dark"\n}');
  const [change] = await planAssistant({ id: 'opencode', directory });
  assert.match(change.path, /\.jsonc$/);
  assert.match(change.after, /preserved/);
  await writeFile(join(directory, 'opencode.jsonc'), '{"providers": {}}');
  await assert.rejects(planAssistant({ id: 'opencode', directory }), /v2/);
  await writeFile(join(directory, 'opencode.json'), '{}');
  await assert.rejects(planAssistant({ id: 'opencode', directory }), /Both/);
});

test('private backups preserve original bytes and concurrent changes are refused', async context => {
  const { home } = await fixture(context);
  const path = join(home, 'settings.json');
  const before = '{"private":"original"}\n';
  await writeFile(path, before);
  const backup = await writeChange({ path, before, after: '{"new":true}\n' });
  assert.equal(await readFile(backup, 'utf8'), before);
  assert.equal((await stat(backup)).mode & 0o777, 0o600);
  await assert.rejects(writeChange({ path, before, after: '{}' }), /changed/);
  assert.equal((await readdir(home)).filter(name => name.includes('apex-tmp')).length, 0);
});

test('symlink files and parent directories are refused', async context => {
  const { home } = await fixture(context);
  const target = join(home, 'real');
  await mkdir(target);
  await writeFile(join(target, 'config'), '{}');
  await symlink(target, join(home, 'linked'));
  await symlink(join(target, 'config'), join(home, 'file-link'));
  await assert.rejects(readConfig(join(home, 'linked', 'config')), /symbolic link/);
  await assert.rejects(readConfig(join(home, 'file-link')), /symbolic link/);
});

test('launch config scopes Claude credentials without mutating parent environment', () => {
  const env = { CALLSTACK_AUTH_TOKEN: 'secret', ANTHROPIC_API_KEY: 'old', CLAUDE_CODE_USE_BEDROCK: '1' };
  const launched = launchOptions('claude', env);
  assert.equal(launched.env.ANTHROPIC_AUTH_TOKEN, 'secret');
  assert.equal(launched.env.ANTHROPIC_API_KEY, undefined);
  assert.equal(launched.env.CLAUDE_CODE_USE_BEDROCK, undefined);
  assert.equal(env.ANTHROPIC_API_KEY, 'old');
  assert.deepEqual(launchOptions('codex', env).args, ['--profile', 'callstack_ai']);
  assert.deepEqual(launchOptions('opencode', env).args, ['--model', 'callstack.ai/callstack/Apex']);
  assert.throws(() => launchOptions('pi', {}), /CALLSTACK_AUTH_TOKEN/);
});

test('CLI dry-run and noninteractive refusal do not write files or leak secrets', async context => {
  const { home, env } = await fixture(context);
  const args = ['init', '--assistants', 'codex,claude,opencode,pi'];
  const preview = cli([...args, '--dry-run'], env);
  assert.equal(preview.status, 0, preview.stderr);
  assert.match(preview.stdout, /Dry run/);
  assert.ok(!preview.stdout.includes(env.CALLSTACK_AUTH_TOKEN));
  assert.deepEqual(await readdir(home), []);
  const refused = cli(args, env);
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /--yes/);
  assert.deepEqual(await readdir(home), []);
});

test('CLI setup, idempotency and fail-before-write for invalid configurations', async context => {
  const { home, env } = await fixture(context);
  const args = ['init', '--assistants', 'codex,claude,opencode,pi', '--yes'];
  const result = cli(args, env);
  assert.equal(result.status, 0, result.stderr);
  const repeated = cli(args, env);
  assert.equal(repeated.status, 0, repeated.stderr);
  assert.match(repeated.stdout, /already up to date/);
  await writeFile(join(env.PI_CODING_AGENT_DIR, 'models.json'), 'invalid');
  await writeFile(join(env.CLAUDE_CONFIG_DIR, 'settings.json'), '{}');
  const failed = cli(args, env);
  assert.equal(failed.status, 1);
  assert.equal(await readFile(join(env.CLAUDE_CONFIG_DIR, 'settings.json'), 'utf8'), '{}');
  assert.ok(!(await readdir(home)).includes('auth.json'));
});

test('CLI validates selections and commands', async context => {
  const { env } = await fixture(context);
  assert.equal(cli(['--version'], env).stdout.trim(), '0.1.0');
  assert.equal(cli(['--help'], env).status, 0);
  for (const args of [['wat'], ['init', '--assistants', 'unknown'], ['init', '--assistants', ''], ['init', '--wat'], ['run', 'unknown']]) {
    assert.equal(cli(args, env).status, 1);
  }
});

test('manual adapters never write editor credentials', async context => {
  const { home } = await fixture(context);
  for (const id of ['cursor', 'copilot']) assert.deepEqual(await planAssistant({ id, directory: home }), []);
});

test('CLI run forwards argument boundaries, child environment and exit status', async context => {
  const { home, env } = await fixture(context);
  const bin = join(home, 'bin');
  await mkdir(bin);
  await writeFile(join(bin, 'claude'), `#!${process.execPath}\nconsole.log(JSON.stringify({ args: process.argv.slice(2), model: process.env.ANTHROPIC_MODEL, token: process.env.ANTHROPIC_AUTH_TOKEN }));\nprocess.exit(7);\n`, { mode: 0o755 });
  const result = cli(['run', 'claude', '--', 'a space', '$(touch should-not-exist)'], { ...env, PATH: bin });
  assert.equal(result.status, 7, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.deepEqual(output.args, ['--model', MODEL, 'a space', '$(touch should-not-exist)']);
  assert.equal(output.model, MODEL);
  assert.equal(output.token, env.CALLSTACK_AUTH_TOKEN);
});

test('shell installer uses user prefix, version pin and forwards init options', async context => {
  const { home, env } = await fixture(context);
  const bin = join(home, 'bin');
  const prefix = join(home, 'prefix with spaces');
  const log = join(home, 'npm-args');
  await mkdir(bin);
  await mkdir(join(prefix, 'bin'), { recursive: true });
  await writeFile(join(bin, 'node'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  await writeFile(join(bin, 'npm'), '#!/bin/sh\nprintf "%s\\n" "$@" > "$INSTALL_LOG"\n', { mode: 0o755 });
  await writeFile(join(prefix, 'bin', 'apex'), '#!/bin/sh\nprintf "ARG:%s\\n" "$@"\n', { mode: 0o755 });
  const result = spawnSync('/bin/sh', ['scripts/install.sh', '--assistants', 'codex,pi', '--yes'], {
    env: { ...env, PATH: bin, APEX_INSTALL_PREFIX: prefix, APEX_VERSION: '0.1.0', INSTALL_LOG: log }, encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  const args = (await readFile(log, 'utf8')).trim().split('\n');
  assert.ok(args.includes(prefix));
  assert.ok(args.includes('@callstack/apex@0.1.0'));
  assert.ok(args.includes('--ignore-scripts'));
  assert.match(result.stdout, /ARG:init\nARG:--assistants\nARG:codex,pi\nARG:--yes/);
});

test('shell installer rejects missing prerequisites and unsafe versions', async context => {
  const { home, env } = await fixture(context);
  const bin = join(home, 'bin');
  await mkdir(bin);
  const run = extra => spawnSync('/bin/sh', ['scripts/install.sh'], { env: { ...env, PATH: bin, ...extra }, encoding: 'utf8' });
  assert.match(run({}).stderr, /requires Node.js/);
  await writeFile(join(bin, 'node'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  await writeFile(join(bin, 'npm'), '#!/bin/sh\nexit 99\n', { mode: 0o755 });
  assert.match(run({}).stderr, /22 or newer/);
  await writeFile(join(bin, 'node'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  assert.match(run({ APEX_VERSION: '../evil' }).stderr, /Invalid APEX_VERSION/);
  assert.match(run({ APEX_INSTALL_PREFIX: 'relative' }).stderr, /absolute path/);
});

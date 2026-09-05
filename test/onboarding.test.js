import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { consoleUrl, credentialInstructions, compatibility, redact } from '../src/onboarding.js';
import { checkGateway } from '../src/diagnostics.js';

async function fixture(context) {
  const home = await realpath(await mkdtemp(join(tmpdir(), 'apex-onboarding-')));
  context.after(() => rm(home, { recursive: true, force: true }));
  const env = { HOME: home, PATH: '', CODEX_HOME: join(home, '.codex'), CLAUDE_CONFIG_DIR: join(home, '.claude'), XDG_CONFIG_HOME: join(home, '.config'), PI_CODING_AGENT_DIR: join(home, '.pi'), APEX_CONSOLE_URL: 'https://console.example.test' };
  const cli = args => spawnSync(process.execPath, [resolve('bin/apex.js'), ...args], { env, encoding: 'utf8' });
  return { home, env, cli };
}

test('Console origins reject unsafe URLs and preserve a non-secret setup destination', () => {
  assert.equal(consoleUrl({}), 'https://platform.callstack.ai/setup');
  assert.equal(consoleUrl({ APEX_CONSOLE_URL: 'http://localhost:5173' }), 'http://localhost:5173/setup');
  for (const value of ['http://example.com', 'javascript:alert(1)', 'https://user:pass@example.com', 'https://example.com/?key=secret', 'https://example.com/#key', 'https://example.com/path']) {
    assert.throws(() => consoleUrl({ APEX_CONSOLE_URL: value }));
  }
});

test('credential instructions support zsh, Bash and PowerShell without interpolating keys', () => {
  for (const platform of ['darwin', 'linux', 'win32']) {
    const instructions = credentialInstructions({ SHELL: '/bin/zsh', CALLSTACK_AUTH_TOKEN: 'test-private-key' }, platform);
    assert.ok(!instructions.includes('test-private-key'));
    assert.match(instructions, /new terminal/);
    assert.match(instructions, platform === 'win32' ? /AsSecureString/ : /read -rs/);
  }
  assert.match(credentialInstructions({}, 'linux'), /exec bash/);
  assert.equal(redact('token=secret', { CALLSTACK_AUTH_TOKEN: 'secret' }), 'token=[redacted]');
});

test('auth prints a handoff without writing or launching a browser by default', async context => {
  const { home, cli } = await fixture(context);
  const result = cli(['auth']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /https:\/\/console.example.test\/setup/);
  assert.deepEqual(await readdir(home), []);
});

test('manual-only initialization cannot claim configuration was verified', async context => {
  const { cli } = await fixture(context);
  const result = cli(['init', '--assistants', 'cursor', '--yes']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /cursor: manual/);
  assert.match(result.stdout, /Credentials missing/);
  assert.doesNotMatch(result.stdout, /already up to date|Setup complete/);
});

test('explicit skip continues valid setup while preserving nonzero partial status', async context => {
  const { env, cli } = await fixture(context);
  const directory = join(env.XDG_CONFIG_HOME, 'opencode');
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'opencode.json'), '{invalid');
  const result = cli(['init', '--assistants', 'opencode,claude', '--yes', '--skip-invalid']);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /opencode: skipped/);
  assert.match(result.stdout, /claude: configured/);
  assert.match(await readFile(join(env.CLAUDE_CONFIG_DIR, 'settings.json'), 'utf8'), /CLAUDE_CODE_ATTRIBUTION_HEADER/);
  assert.equal(await readFile(join(directory, 'opencode.json'), 'utf8'), '{invalid');
});

test('doctor stays read-only and refuses noninteractive live checks without consent', async context => {
  const { home, cli } = await fixture(context);
  const local = cli(['doctor', '--assistants', 'codex']);
  assert.equal(local.status, 1);
  assert.match(local.stdout, /Local setup needs attention/);
  const live = cli(['doctor', '--assistants', 'codex', '--live']);
  assert.equal(live.status, 1);
  assert.match(live.stdout, /Live check not performed/);
  assert.deepEqual(await readdir(home), []);
  assert.equal(cli(['init', '--live']).status, 1);
  assert.equal(cli(['doctor', '--transport', 'responses']).status, 1);
});

test('compatibility reports old versions, manual tools, missing executables and Windows shims', async context => {
  const { home } = await fixture(context);
  const binary = join(home, 'codex');
  await writeFile(binary, '#!/bin/sh\nprintf "codex-cli 0.100.0\\n"\n', { mode: 0o755 });
  assert.equal((await compatibility({ id: 'codex', binary })).state, 'unsupported');
  assert.equal((await compatibility({ id: 'cursor' })).state, 'manual');
  assert.equal((await compatibility({ id: 'pi' })).state, 'missing');
  assert.equal((await compatibility({ id: 'pi', binary: 'pi.cmd' }, 'win32')).state, 'unsupported');
});

test('dry-run never executes detected version probes', async context => {
  const { home, env, cli } = await fixture(context);
  env.PATH = home;
  const marker = join(home, 'was-executed');
  await writeFile(join(home, 'codex'), `#!/bin/sh\nprintf run > '${marker}'\n`, { mode: 0o755 });
  assert.equal(cli(['init', '--assistants', 'codex', '--dry-run']).status, 0);
  assert.ok(!(await readdir(home)).includes('was-executed'));
});

test('live diagnostics use bounded requests and never follow redirects or expose error bodies', async () => {
  for (const transport of ['chat-completions', 'responses', 'anthropic']) {
    const result = await checkGateway('test-private-key', transport, async (url, options) => {
      assert.ok(url.startsWith('https://api.callstack.ai/v1/'));
      assert.equal(options.redirect, 'error');
      assert.ok(options.signal);
      assert.equal(JSON.parse(options.body).model, 'callstack/Apex');
      const payload = transport === 'chat-completions' ? { choices: [{ message: { content: 'OK' } }] }
        : transport === 'anthropic' ? { content: [{ type: 'text', text: 'OK' }] }
          : { output: [{ type: 'message', content: [{ type: 'output_text', text: 'OK' }] }] };
      return Response.json(payload);
    });
    assert.equal(result.ok, true);
    assert.ok(!result.message.includes('test-private-key'));
  }
  for (const status of [400, 401, 402, 403, 404, 429, 500]) {
    const result = await checkGateway('test-private-key', 'responses', async () => new Response('test-private-key', { status }));
    assert.equal(result.ok, false);
    assert.match(result.message, new RegExp(`HTTP ${status}`));
    assert.ok(!result.message.includes('test-private-key'));
  }
  assert.equal((await checkGateway('', 'responses', () => { throw new Error('should not fetch'); })).category, 'credentials-missing');
  assert.equal((await checkGateway('key', 'responses', () => { throw new Error('private body'); })).category, 'network');
  for (const body of ['<html>Proxy error</html>', '{}', 'x'.repeat(70_000)]) {
    assert.equal((await checkGateway('key', 'responses', async () => new Response(body))).category, 'invalid-response');
  }
});

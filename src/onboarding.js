import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);
export const GUIDE_URL = 'https://github.com/callstackincubator/apex#readme';

export function consoleUrl(env = process.env) {
  const origin = new URL(env.APEX_CONSOLE_URL || 'https://platform.callstack.ai');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
  if ((origin.protocol !== 'https:' && !(local && origin.protocol === 'http:')) ||
      origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/') {
    throw new Error('APEX_CONSOLE_URL must be an HTTPS origin without a path, credentials, query, or fragment (HTTP is allowed on localhost).');
  }
  return new URL('/setup', origin).href;
}

export function credentialInstructions(env = process.env, platform = process.platform) {
  let prompt;
  if (platform === 'win32') {
    prompt = "$secret = Read-Host 'Callstack API key' -AsSecureString\n$env:CALLSTACK_AUTH_TOKEN = [System.Net.NetworkCredential]::new('', $secret).Password\nRemove-Variable secret";
  } else if (env.SHELL?.endsWith('/zsh')) {
    prompt = "read -rs 'CALLSTACK_AUTH_TOKEN?Callstack API key: '; printf '\\n'\nexport CALLSTACK_AUTH_TOKEN";
  } else {
    prompt = "bash -c 'read -rs -p \"Callstack API key: \" CALLSTACK_AUTH_TOKEN; printf \"\\n\"; export CALLSTACK_AUTH_TOKEN; exec bash'";
  }
  return `Get or manage your key: ${consoleUrl(env)}\nAlready have a key? Reuse it; creating another key is optional.\nEnter it without placing its value in shell history:\n\n${prompt}\n\nCredentials are available only to this shell and its children. Repeat in a new terminal,\nor inject CALLSTACK_AUTH_TOKEN using your secret manager. No key or shell profile is saved by Apex.\nAfter setting it, run: npx @callstack/apex doctor\nSetup guide: ${GUIDE_URL}`;
}

export function redact(message, env = process.env) {
  const value = String(message);
  return env.CALLSTACK_AUTH_TOKEN ? value.replaceAll(env.CALLSTACK_AUTH_TOKEN, '[redacted]') : value;
}

export async function openConsole(env = process.env, platform = process.platform) {
  const url = consoleUrl(env);
  const command = platform === 'darwin' ? 'open' : platform === 'win32' ? 'rundll32.exe' : 'xdg-open';
  const args = platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url];
  await execute(command, args, { timeout: 10_000, maxBuffer: 4096, windowsHide: true });
}

export async function compatibility(assistant, platform = process.platform) {
  if (['cursor', 'copilot'].includes(assistant.id)) return { state: 'manual', detail: 'Manual editor setup; configuration has not been verified.' };
  if (!assistant.binary) return { state: 'missing', detail: 'Executable not found on PATH. Configuration can be prepared, but install the assistant before launching.' };
  if (platform === 'win32' && /\.(cmd|bat)$/i.test(assistant.binary)) {
    return { state: 'unsupported', detail: 'Windows command shims cannot be launched by Apex. Use WSL or configure and launch the assistant manually.' };
  }
  let version;
  try {
    const result = await execute(assistant.binary, ['--version'], { timeout: 3000, maxBuffer: 4096, windowsHide: true });
    version = result.stdout.match(/\b(\d+)\.(\d+)\.(\d+)\b/);
  } catch {
    return { state: 'unknown', detail: 'Could not determine the installed version; compatibility is not verified.' };
  }
  if (!version) return { state: 'unknown', detail: 'Version was not recognized; compatibility is not verified.' };
  const major = Number(version[1]);
  const minor = Number(version[2]);
  if (assistant.id === 'codex' && major === 0 && minor < 134) return { state: 'unsupported', detail: `Codex ${version[0]} needs an upgrade: this adapter requires separate profile-file support (0.134.0+).` };
  if (assistant.id === 'opencode' && major !== 1) return { state: 'unsupported', detail: `OpenCode ${version[0]} is outside this adapter's v1 configuration support. Use the manual setup guide.` };
  return { state: 'available', detail: `${version[0]} detected. ${assistant.id === 'pi' ? 'Pi must support $VARIABLE API-key interpolation; verify with a request.' : 'Configuration support does not verify gateway access.'}` };
}

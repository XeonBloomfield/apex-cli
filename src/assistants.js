import { access, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, delimiter } from 'node:path';
import { homedir } from 'node:os';
import { editJson, parseJson, readConfig, addToml } from './config.js';

export const MODEL = 'callstack/Apex';
export const BASE_URL = 'https://api.callstack.ai/v1';
export const GUIDE_URL = 'https://app.notion.com/p/callstack/Apex-how-to-use-it-36d5d027c0f880e99d03d1c37a77382f';
export const IDS = ['opencode', 'codex', 'claude', 'pi', 'cursor', 'copilot'];
export const NAMES = {
  opencode: 'OpenCode', codex: 'Codex', claude: 'Claude Code', pi: 'Pi',
  cursor: 'Cursor', copilot: 'VS Code (Copilot)',
};
export const RUNNABLE = ['codex', 'claude', 'opencode', 'pi'];

async function exists(path) {
  try { await stat(path); return true; }
  catch (error) { if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return false; throw error; }
}

export async function executable(command, env = process.env, platform = process.platform) {
  const extensions = platform === 'win32' ? (env.PATHEXT || '.EXE;.CMD;.BAT').split(';') : [''];
  for (const directory of (env.PATH || '').split(platform === 'win32' ? ';' : delimiter).filter(Boolean)) {
    for (const extension of extensions) {
      const path = join(directory, command + extension.toLowerCase());
      try {
        await access(path, platform === 'win32' ? constants.F_OK : constants.X_OK);
        if ((await stat(path)).isFile()) return path;
      } catch (error) {
        if (!['ENOENT', 'ENOTDIR', 'EACCES'].includes(error.code)) throw error;
      }
    }
  }
  return null;
}

export function locations(home = homedir(), env = process.env, platform = process.platform) {
  const config = env.XDG_CONFIG_HOME || join(home, '.config');
  const userData = platform === 'darwin' ? join(home, 'Library', 'Application Support')
    : platform === 'win32' ? env.APPDATA || join(home, 'AppData', 'Roaming') : config;
  return {
    opencode: join(config, 'opencode'),
    codex: env.CODEX_HOME || join(home, '.codex'),
    claude: env.CLAUDE_CONFIG_DIR || join(home, '.claude'),
    pi: env.PI_CODING_AGENT_DIR || join(home, '.pi', 'agent'),
    cursor: join(userData, 'Cursor'),
    copilot: join(userData, 'Code'),
  };
}

export async function detect(options = {}) {
  const home = options.home ?? homedir();
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const paths = locations(home, env, platform);
  return Promise.all(IDS.map(async id => {
    const command = id === 'copilot' ? 'code' : id;
    const binary = await executable(command, env, platform);
    const markers = [paths[id]];
    if (platform === 'darwin' && ['cursor', 'copilot'].includes(id)) {
      const name = id === 'cursor' ? 'Cursor.app' : 'Visual Studio Code.app';
      markers.push(join('/Applications', name), join(home, 'Applications', name));
    }
    if (id === 'copilot') markers.push(join(home, '.vscode', 'extensions'));
    const found = [];
    for (const path of markers) if (await exists(path)) found.push(path);
    return { id, detected: Boolean(binary || found.length), binary, evidence: binary || found[0], directory: paths[id] };
  }));
}

export async function planAssistant(assistant) {
  const changes = [];
  const json = async (filename, updates) => {
    const path = join(assistant.directory, filename);
    const before = await readConfig(path);
    const after = editJson(before, typeof updates === 'function' ? updates(parseJson(before, path)) : updates, path);
    changes.push({ path, before, after, format: 'json' });
  };
  switch (assistant.id) {
    case 'opencode': {
      const hasJson = await exists(join(assistant.directory, 'opencode.json'));
      const hasJsonc = await exists(join(assistant.directory, 'opencode.jsonc'));
      if (hasJson && hasJsonc) throw new Error('Both opencode.json and opencode.jsonc exist. Consolidate them before init.');
      await json(hasJsonc ? 'opencode.jsonc' : 'opencode.json', existing => {
        if (Object.hasOwn(existing, 'providers')) throw new Error('OpenCode v2 providers format detected. This adapter targets the v1 provider format from the Callstack guide.');
        return [
        [['provider', 'callstack.ai', 'npm'], '@ai-sdk/openai-compatible'],
        [['provider', 'callstack.ai', 'name'], 'callstack.ai'],
        [['provider', 'callstack.ai', 'options', 'baseURL'], BASE_URL],
        [['provider', 'callstack.ai', 'options', 'apiKey'], '{env:CALLSTACK_AUTH_TOKEN}'],
        [['provider', 'callstack.ai', 'models', MODEL, 'name'], 'Apex'],
        ];
      });
      break;
    }
    case 'pi':
      await json('models.json', existing => {
        const models = existing.providers?.callstack?.models ?? [];
        if (!Array.isArray(models) || models.some(model => !model || typeof model.id !== 'string')) {
          throw new Error('Expected Pi models to be an array of model objects.');
        }
        return [
          [['providers', 'callstack', 'baseUrl'], BASE_URL],
          [['providers', 'callstack', 'api'], 'openai-completions'],
          [['providers', 'callstack', 'apiKey'], '$CALLSTACK_AUTH_TOKEN'],
          [['providers', 'callstack', 'models'], models.some(model => model.id === MODEL) ? models : [...models, { id: MODEL }]],
        ];
      });
      break;
    case 'claude':
      await json('settings.json', [[['env', 'CLAUDE_CODE_ATTRIBUTION_HEADER'], '0']]);
      break;
    case 'codex': {
      const path = join(assistant.directory, 'callstack_ai.config.toml');
      const before = await readConfig(path);
      const after = addToml(before, {
        model_provider: 'callstack_ai',
        model: MODEL,
        model_providers: { callstack_ai: {
          name: 'callstack.ai', base_url: BASE_URL, env_key: 'CALLSTACK_AUTH_TOKEN',
          wire_api: 'responses', requires_openai_auth: false,
        } },
      }, path);
      changes.push({ path, before, after, format: 'toml' });
      break;
    }
  }
  return changes;
}

export function launchOptions(id, env = process.env) {
  const token = env.CALLSTACK_AUTH_TOKEN;
  if (!token?.trim()) throw new Error('Set CALLSTACK_AUTH_TOKEN in your environment before launching.');
  const childEnv = { ...env };
  switch (id) {
    case 'opencode': return { args: ['--model', `callstack.ai/${MODEL}`], env: childEnv };
    case 'codex': return { args: ['--profile', 'callstack_ai'], env: childEnv };
    case 'pi': return { args: ['--provider', 'callstack', '--model', MODEL], env: childEnv };
    case 'claude':
      for (const key of ['ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY']) delete childEnv[key];
      Object.assign(childEnv, {
        ANTHROPIC_BASE_URL: 'https://api.callstack.ai', ANTHROPIC_AUTH_TOKEN: token,
        ANTHROPIC_MODEL: MODEL, CLAUDE_CODE_ATTRIBUTION_HEADER: '0',
        ANTHROPIC_DEFAULT_OPUS_MODEL: MODEL, ANTHROPIC_DEFAULT_SONNET_MODEL: MODEL,
        ANTHROPIC_DEFAULT_HAIKU_MODEL: MODEL, CLAUDE_CODE_SUBAGENT_MODEL: MODEL,
      });
      return { args: ['--model', MODEL], env: childEnv };
    default: throw new Error(`Cannot launch ${id}. Use the editor's model selector.`);
  }
}

// What `apex run <id>` actually types for you, so the summary can show the command it replaces.
// The placeholder token is never shown: only the argument list is part of the expansion.
const RUN_NOTE = { claude: '(ANTHROPIC_* gateway environment set)' };

export function runExpansion(id) {
  const { args } = launchOptions(id, { CALLSTACK_AUTH_TOKEN: 'placeholder' });
  return [`${id} ${args.join(' ')}`, RUN_NOTE[id]].filter(Boolean).join('  ');
}

// One line per key: the whole object on one line cannot be folded to a terminal, and a step that
// wraps into the gutter loses its shape.
const COPILOT_MODEL = JSON.stringify({ id: MODEL, name: 'Apex', url: BASE_URL, toolCalling: true, vision: true }, null, 2);

export const MANUAL = {
  cursor: [
    `Cursor: Settings → Models → API Keys → OpenAI API Key. Enter your Callstack key, override the base URL with ${BASE_URL}, add and enable ${MODEL}, then select it in Agent.`,
  ],
  copilot: [
    'Installation of Copilot itself is not verified: Copilot → model selector → Manage Models → Add Models → Custom Endpoint → name callstack.ai → enter your key → Chat Completions.',
    'Keep the generated apiKey secret reference; add this object to its models array:',
    ...COPILOT_MODEL.split('\n'),
  ],
};
export const MANUAL_IDS = Object.keys(MANUAL);

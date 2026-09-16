'use strict';

const path = require('node:path');
const { commandExists, commandVersion, dirExists, homeDir } = require('../util/detect');
const { readJsonIfExists, backupFile, writeJson, pathExists } = require('../util/fsHelpers');

const id = 'opencode';
const name = 'OpenCode';

function detect() {
  return commandExists('opencode') || dirExists(homeDir(), '.config', 'opencode');
}

// OpenCode 2 renamed the config's top-level `provider` map to `providers` and
// changed the per-model capability field names (tool_call -> capabilities.tools,
// etc). It's still invoked as `opencode`, so version is the only way to tell
// v1 and v2 apart. If detection fails, default to the v1 shape: OpenCode 2
// still reads and normalizes v1-style config, but v1 installs can't read v2-only fields.
function isV2() {
  const version = commandVersion('opencode', ['--version']);
  return Boolean(version && version.major >= 2);
}

function modelConfigV1() {
  return {
    name: 'Apex',
    reasoning: true,
    tool_call: true,
    attachment: true,
    modalities: { input: ['text', 'image'], output: ['text'] },
    limit: { context: 262144, input: 240000, output: 16384 },
    options: { reasoningEffort: 'medium' },
    variants: {
      none: { reasoningEffort: 'none' },
      low: { reasoningEffort: 'low' },
      medium: { reasoningEffort: 'medium' },
      xhigh: { reasoningEffort: 'xhigh' },
    },
  };
}

function modelConfigV2() {
  return {
    name: 'Apex',
    capabilities: { tools: true, input: ['text', 'image'], output: ['text'] },
    limit: { context: 262144, input: 240000, output: 16384 },
    settings: { reasoningEffort: 'medium' },
    variants: [
      { id: 'none', settings: { reasoningEffort: 'none' } },
      { id: 'low', settings: { reasoningEffort: 'low' } },
      { id: 'medium', settings: { reasoningEffort: 'medium' } },
      { id: 'xhigh', settings: { reasoningEffort: 'xhigh' } },
    ],
  };
}

function apply({ apiKey, dryRun, log }) {
  const home = homeDir();
  const configPath = path.join(home, '.config', 'opencode', 'opencode.json');
  const authPath = path.join(home, '.local', 'share', 'opencode', 'auth.json');
  const v2 = isV2();

  const config = readJsonIfExists(configPath) || { $schema: 'https://opencode.ai/config.json' };

  if (v2) {
    config.providers = config.providers || {};
    config.providers['callstack.ai'] = {
      name: 'callstack.ai',
      package: '@opencode/ai/providers/openai-compatible',
      settings: { baseURL: 'https://api.callstack.ai/v1' },
      models: { 'callstack/Apex': modelConfigV2() },
    };
  } else {
    config.provider = config.provider || {};
    config.provider['callstack.ai'] = {
      npm: '@ai-sdk/openai-compatible',
      name: 'callstack.ai',
      options: { baseURL: 'https://api.callstack.ai/v1' },
      models: { 'callstack/Apex': modelConfigV1() },
    };
  }

  if (!dryRun) {
    backupFile(configPath);
    writeJson(configPath, config);
  }
  log(`wrote ${configPath} (OpenCode ${v2 ? 'v2' : 'v1'} config format)`);

  if (v2) {
    log('run `/connect`, select `callstack.ai` -> "Manually enter API Key", then paste your Apex API key');
  } else if (pathExists(authPath)) {
    log(`skipped ${authPath} (already exists — leaving your existing credentials untouched)`);
  } else if (apiKey) {
    if (!dryRun) writeJson(authPath, { 'callstack.ai': { type: 'api', key: apiKey } });
    log(`wrote ${authPath}`);
  } else {
    log(`skipped ${authPath} (no API key provided — create it manually, see docs)`);
  }

  return { configured: true };
}

module.exports = { id, name, detect, apply };

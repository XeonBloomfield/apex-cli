'use strict';

const path = require('node:path');
const { commandExists, dirExists, homeDir } = require('../util/detect');
const { readTextIfExists, backupFile, writeFileEnsuringDir } = require('../util/fsHelpers');
const { upsertTomlSection } = require('../util/toml');

const id = 'codex';
const name = 'Codex';

function detect() {
  return commandExists('codex') || dirExists(homeDir(), '.codex');
}

function apply({ dryRun, log }) {
  const home = homeDir();
  const configPath = path.join(home, '.codex', 'config.toml');
  const profilePath = path.join(home, '.codex', 'callstack_ai.config.toml');

  const providerBody = [
    'name                  = "callstack.ai"',
    'base_url              = "https://api.callstack.ai/v1"',
    'env_key               = "CALLSTACK_AUTH_TOKEN"',
    'wire_api              = "responses"',
    'requires_openai_auth  = false',
    '',
  ].join('\n');

  const existingConfig = readTextIfExists(configPath);
  const nextConfig = upsertTomlSection(existingConfig, 'model_providers.callstack_ai', providerBody);
  if (!dryRun) {
    backupFile(configPath);
    writeFileEnsuringDir(configPath, nextConfig);
  }
  log(`wrote ${configPath}`);

  const profileContents = [
    'model_provider = "callstack_ai"',
    'model          = "callstack/Apex"',
    'model_context_window    = 262144',
    'model_max_output_tokens = 16384',
    'model_reasoning_effort  = "medium"',
    '',
  ].join('\n');
  if (!dryRun) {
    backupFile(profilePath);
    writeFileEnsuringDir(profilePath, profileContents);
  }
  log(`wrote ${profilePath}`);

  log('run with: export CALLSTACK_AUTH_TOKEN="<your Apex API key>" && codex -p callstack_ai');

  return { configured: true };
}

module.exports = { id, name, detect, apply };

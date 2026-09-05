'use strict';

const path = require('node:path');
const { commandExists, dirExists, homeDir } = require('../util/detect');
const { readJsonIfExists, backupFile, writeJson, pathExists } = require('../util/fsHelpers');

const id = 'opencode';
const name = 'OpenCode';

function detect() {
  return commandExists('opencode') || dirExists(homeDir(), '.config', 'opencode');
}

function apply({ apiKey, dryRun, log }) {
  const home = homeDir();
  const configPath = path.join(home, '.config', 'opencode', 'opencode.json');
  const authPath = path.join(home, '.local', 'share', 'opencode', 'auth.json');

  const config = readJsonIfExists(configPath) || { $schema: 'https://opencode.ai/config.json' };
  config.provider = config.provider || {};
  config.provider['callstack.ai'] = {
    npm: '@ai-sdk/openai-compatible',
    name: 'callstack.ai',
    options: { baseURL: 'https://api.callstack.ai/v1' },
    models: { 'callstack/Apex': { name: 'Apex' } },
  };

  if (!dryRun) {
    backupFile(configPath);
    writeJson(configPath, config);
  }
  log(`wrote ${configPath}`);

  if (pathExists(authPath)) {
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

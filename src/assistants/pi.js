'use strict';

const path = require('node:path');
const { dirExists, homeDir } = require('../util/detect');
const { readJsonIfExists, backupFile, writeJson } = require('../util/fsHelpers');

const id = 'pi';
const name = 'pi';

function detect() {
  // ".pi" is checked instead of the "pi" binary, which collides with unrelated tools on PATH.
  return dirExists(homeDir(), '.pi');
}

function apply({ apiKey, dryRun, log }) {
  const configPath = path.join(homeDir(), '.pi', 'agent', 'models.json');
  const config = readJsonIfExists(configPath) || { providers: {} };
  config.providers = config.providers || {};
  config.providers.callstack = {
    baseUrl: 'https://api.callstack.ai/v1',
    api: 'openai-completions',
    apiKey: apiKey || 'XXX',
    models: [
      {
        id: 'callstack/Apex',
        reasoning: true,
        input: ['text', 'image'],
        thinkingLevelMap: {
          off: 'none',
          minimal: null,
          low: 'low',
          medium: 'medium',
          high: null,
          xhigh: 'xhigh',
          max: null,
        },
        contextWindow: 262144,
      },
    ],
  };

  if (!dryRun) {
    backupFile(configPath);
    writeJson(configPath, config);
  }
  log(`wrote ${configPath}`);
  if (!apiKey) {
    log('no API key provided — replace the placeholder "XXX" in that file manually');
  }
  log('known issue: some users have hit Cloudflare 403s with pi — ask in #apex if this happens to you');

  return { configured: true };
}

module.exports = { id, name, detect, apply };

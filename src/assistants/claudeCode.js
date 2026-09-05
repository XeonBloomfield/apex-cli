'use strict';

const path = require('node:path');
const { commandExists, dirExists, homeDir } = require('../util/detect');
const { readJsonIfExists, backupFile, writeJson } = require('../util/fsHelpers');

const id = 'claude-code';
const name = 'Claude Code';

function detect() {
  return commandExists('claude') || dirExists(homeDir(), '.claude');
}

function apply({ apiKey, dryRun, log }) {
  const settingsPath = path.join(homeDir(), '.claude', 'settings.json');
  const settings = readJsonIfExists(settingsPath) || {};
  settings.env = settings.env || {};
  settings.env.CLAUDE_CODE_ATTRIBUTION_HEADER = '0';
  settings.env.ANTHROPIC_BASE_URL = 'https://api.callstack.ai';
  settings.env.ANTHROPIC_MODEL = 'callstack/Apex';
  if (apiKey) {
    settings.env.ANTHROPIC_AUTH_TOKEN = apiKey;
  }

  if (!dryRun) {
    backupFile(settingsPath);
    writeJson(settingsPath, settings);
  }
  log(`wrote ${settingsPath}`);
  if (!apiKey) {
    log('no API key provided — set ANTHROPIC_AUTH_TOKEN in that file manually');
  }

  return { configured: true };
}

module.exports = { id, name, detect, apply };

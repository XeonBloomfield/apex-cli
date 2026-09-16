'use strict';

const { commandExists, dirExists, anyAppPathExists, homeDir } = require('../util/detect');

const id = 'vscode-copilot';
const name = 'VS Code (GitHub Copilot)';

function detect() {
  return (
    commandExists('code') ||
    dirExists(homeDir(), '.vscode') ||
    anyAppPathExists(['/Applications/Visual Studio Code.app'])
  );
}

// Adding a custom Copilot model endpoint goes through VS Code's GUI and an
// interactive secret input, so this can't be written automatically.
function apply({ log }) {
  log('VS Code + GitHub Copilot requires manual setup (make sure VS Code is up to date):');
  log('  1. Open the GitHub Copilot panel -> model selector -> "Manage Models..."');
  log('  2. "Add Models" -> "Custom Endpoint"');
  log('  3. Name it "callstack.ai", paste your Apex API key, choose "Chat Completions"');
  log('  4. In the JSON editor that opens, set the "models" array to:');
  log('     [{');
  log('       "id": "callstack/Apex", "name": "Apex", "url": "https://api.callstack.ai/v1",');
  log('       "toolCalling": true, "vision": true, "thinking": true,');
  log('       "contextWindow": 262144, "maxOutputTokens": 16384,');
  log('       "supportsReasoningEffort": ["none", "low", "medium", "xhigh"], "reasoningEffortFormat": "chat-completions"');
  log('     }]');

  return { configured: false, manual: true };
}

module.exports = { id, name, detect, apply };

'use strict';

const { commandExists, dirExists, anyAppPathExists, homeDir } = require('../util/detect');

const id = 'cursor';
const name = 'Cursor';

function detect() {
  return (
    commandExists('cursor') ||
    dirExists(homeDir(), '.cursor') ||
    anyAppPathExists(['/Applications/Cursor.app'])
  );
}

// Cursor's model configuration lives behind its GUI and isn't a documented file
// format, so this can't be written automatically — print the manual steps instead.
function apply({ log }) {
  log('Cursor requires manual setup (no config file to write automatically):');
  log('  1. Cursor Settings -> Models');
  log('  2. Enable API Keys -> OpenAI API Key, confirm the prompt');
  log('  3. Paste your Apex API key, and set "Override OpenAI Base URL" to https://api.callstack.ai/v1');
  log('  4. In Models, "Add Custom Model" -> enter callstack/Apex -> enable it');
  log('  5. Cmd+L -> pick "Apex" from the model dropdown');
  log('Note: Cursor has no way to declare model capabilities (tool calling, vision, reasoning) for a custom model — it infers them, so the steps above are all there is to configure.');

  return { configured: false, manual: true };
}

module.exports = { id, name, detect, apply };

'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { readJsonIfExists, pathExists, backupFile } = require('../util/fsHelpers');

const id = 'ai-sdk';
const name = 'Vercel AI SDK / Eve (programmatic)';

function projectDeps(cwd) {
  const pkg = readJsonIfExists(path.join(cwd, 'package.json'));
  if (!pkg) return null;
  return { ...pkg.dependencies, ...pkg.devDependencies };
}

function detect({ cwd }) {
  const deps = projectDeps(cwd);
  if (!deps) return false;
  return Boolean(deps['ai'] || deps['@ai-sdk/openai'] || deps['eve']);
}

function apply({ cwd, apiKey, dryRun, log }) {
  const deps = projectDeps(cwd) || {};
  const envPath = path.join(cwd, '.env');
  const existingEnv = pathExists(envPath) ? fs.readFileSync(envPath, 'utf8') : '';

  if (apiKey && !/^APEX_API_KEY=/m.test(existingEnv)) {
    const separator = existingEnv && !existingEnv.endsWith('\n') ? '\n' : '';
    const nextEnv = `${existingEnv}${separator}APEX_API_KEY=${apiKey}\n`;
    if (!dryRun) {
      backupFile(envPath);
      fs.writeFileSync(envPath, nextEnv);
    }
    log(`wrote APEX_API_KEY to ${envPath} (make sure .env is gitignored)`);
  } else if (!apiKey) {
    log(`no API key provided — add APEX_API_KEY manually to ${envPath}`);
  } else {
    log(`${envPath} already has APEX_API_KEY, left untouched`);
  }

  log('connector snippet (Vercel AI SDK):');
  log("  import { createOpenAI } from '@ai-sdk/openai';");
  log('  const apex = createOpenAI({ apiKey: process.env.APEX_API_KEY, baseURL: "https://api.callstack.ai/v1", name: "callstack" });');
  log('  // use apex(\'callstack/Apex\') with generateText / streamText');
  log('  // reasoning effort (none/low/medium/xhigh): pass providerOptions: { callstack: { reasoningEffort: "medium" } }');

  if (deps['eve']) {
    log('Eve note: set modelContextWindowTokens: 262_144 on defineAgent, or compaction will fail to compile.');
  }

  return { configured: Boolean(apiKey) };
}

module.exports = { id, name, detect, apply };

'use strict';

const assistants = require('./assistants');
const { askHidden } = require('./util/prompt');

async function resolveApiKey(opts) {
  if (opts.apiKey) return opts.apiKey;
  if (process.env.APEX_API_KEY) return process.env.APEX_API_KEY;
  if (process.env.CALLSTACK_AUTH_TOKEN) return process.env.CALLSTACK_AUTH_TOKEN;
  if (opts.noKey || opts.yes) return null;
  return askHidden('Apex API key (leave blank to skip, add it manually later): ');
}

function selectAssistants(opts) {
  let list = assistants;
  if (opts.only && opts.only.length) {
    list = list.filter((a) => opts.only.includes(a.id));
  }
  if (opts.skip && opts.skip.length) {
    list = list.filter((a) => !opts.skip.includes(a.id));
  }
  return list;
}

async function runInit(opts) {
  const cwd = process.cwd();
  const apiKey = await resolveApiKey(opts);
  const ctx = { cwd, apiKey, dryRun: Boolean(opts.dryRun) };

  const candidates = selectAssistants(opts);
  const detected = candidates.filter((a) => {
    try {
      return a.detect(ctx);
    } catch {
      return false;
    }
  });

  if (!detected.length) {
    console.log('No supported AI assistants were detected on this machine.');
    console.log(`Supported: ${assistants.map((a) => a.name).join(', ')}`);
    return;
  }

  console.log(`Detected: ${detected.map((a) => a.name).join(', ')}`);
  if (opts.dryRun) console.log('(dry run — no files will be written)\n');

  const results = [];
  for (const assistant of detected) {
    console.log(`\n${assistant.name}`);
    const log = (line) => console.log(`  ${line}`);
    try {
      const result = assistant.apply({ ...ctx, log });
      results.push({ assistant, ...result });
    } catch (err) {
      log(`error: ${err.message}`);
      results.push({ assistant, configured: false, error: err.message });
    }
  }

  const configured = results.filter((r) => r.configured);
  const manual = results.filter((r) => r.manual);
  console.log('\nSummary:');
  if (configured.length) {
    console.log(`  Configured automatically: ${configured.map((r) => r.assistant.name).join(', ')}`);
  }
  if (manual.length) {
    console.log(`  Needs manual steps: ${manual.map((r) => r.assistant.name).join(', ')}`);
  }
  if (!apiKey) {
    console.log('  No API key was provided — some config files were written with a placeholder.');
    console.log('  Never commit real API keys; keep them out of version control.');
  }
  console.log('\nDocs: see the internal "Apex - how to use it?" Notion page, or ask in #apex on Slack.');
}

async function runList(opts) {
  const cwd = process.cwd();
  const ctx = { cwd };
  for (const assistant of assistants) {
    let isDetected = false;
    try {
      isDetected = assistant.detect(ctx);
    } catch {
      isDetected = false;
    }
    console.log(`${isDetected ? '[x]' : '[ ]'} ${assistant.name}`);
  }
}

module.exports = { runInit, runList };

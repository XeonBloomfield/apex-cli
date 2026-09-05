import { planAssistant } from './assistants.js';
import { readConfig, writeChange } from './config.js';

export async function planSetup(assistants) {
  const results = [];
  for (const assistant of assistants) {
    try { results.push({ assistant, changes: await planAssistant(assistant), error: null }); }
    catch (error) { results.push({ assistant, changes: [], error: error.message }); }
  }
  return results;
}

export async function applySetup(plans, report = () => {}) {
  const results = [];
  for (const plan of plans) {
    if (plan.error) { results.push({ id: plan.assistant.id, state: 'skipped', error: plan.error }); continue; }
    try {
      for (const change of plan.changes) {
        if (await readConfig(change.path) !== change.before) throw new Error(`Configuration changed: ${change.path}. Run init again.`);
      }
      let changed = false;
      for (const change of plan.changes) {
        if (change.before === change.after) continue;
        const backup = await writeChange(change);
        report({ ...change, backup });
        changed = true;
      }
      results.push({ id: plan.assistant.id, state: plan.changes.length ? changed ? 'configured' : 'unchanged' : 'manual', error: null });
    } catch (error) { results.push({ id: plan.assistant.id, state: 'failed', error: error.message }); }
  }
  return results;
}

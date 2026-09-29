import { join } from 'node:path';
import { homedir } from 'node:os';
import { readConfig, sha256, writeAtomic } from './config.js';

const KEEP_BATCHES = 20;

export function journalPath(env = process.env, home = homedir(), platform = process.platform) {
  if (env.APEX_STATE_DIR) return join(env.APEX_STATE_DIR, 'journal.json');
  const state = env.XDG_STATE_HOME || (platform === 'win32'
    ? join(env.APPDATA || join(home, 'AppData', 'Roaming'), 'apex-state')
    : join(home, '.local', 'state'));
  return join(state, 'apex', 'journal.json');
}

export async function readJournal(path) {
  const text = await readConfig(path);
  if (text === null) return [];
  let entries;
  try { entries = JSON.parse(text); }
  catch { throw new Error(`Apex CLI journal is not valid JSON: ${path}\n  Inspect or remove it manually; Apex CLI changed nothing.`); }
  // Shape only: an entry with no backup stays readable so planUndo can skip that one file with a
  // reason, instead of the whole journal becoming unreadable and blocking every other restore.
  const shaped = entry => typeof entry?.batch === 'string' && typeof entry?.at === 'string'
    && typeof entry?.path === 'string' && typeof entry?.afterSha === 'string'
    && (entry.backup === null || typeof entry.backup === 'string');
  if (!Array.isArray(entries) || entries.some(entry => !shaped(entry))) {
    throw new Error(`Unrecognised Apex CLI journal: ${path}\n  Inspect or remove it manually; Apex CLI changed nothing.`);
  }
  return entries;
}

async function writeJournal(path, entries) {
  const keep = new Set(batchIds(entries).slice(-KEEP_BATCHES));
  await writeAtomic(path, `${JSON.stringify(entries.filter(entry => keep.has(entry.batch)), null, 2)}\n`);
}

// Oldest first, in the order the setups ran.
export const batchIds = entries => [...new Set(entries.map(entry => entry.batch))];

export function newEntry(change, batch, backup) {
  return {
    batch,
    at: new Date().toISOString(),
    path: change.path,
    format: change.format ?? 'json',
    created: change.before === null,
    beforeSha: change.before === null ? null : sha256(change.before),
    afterSha: sha256(change.after),
    backup,
    undoneAt: null,
  };
}

export async function markUndone(journalFile, entry) {
  const entries = await readJournal(journalFile);
  const found = entries.find(candidate => candidate.batch === entry.batch
    && candidate.path === entry.path && !candidate.undoneAt);
  if (!found) {
    throw new Error(`Journal has no pending entry for ${entry.path}. That file was already reverted, `
      + `so mark it undone by hand if you restored it yourself.`);
  }
  found.undoneAt = new Date().toISOString();
  await writeJournal(journalFile, entries);
}

// One entry per saved file, not one journal rewrite per batch: a write that fails halfway
// still leaves everything already on disk undoable.
export async function appendEntry(journalFile, entry) {
  const entries = await readJournal(journalFile);
  entries.push(entry);
  await writeJournal(journalFile, entries);
}

// Newest first, and only the files each setup still has to take back.
function pendingBatches(entries) {
  return batchIds(entries).reverse()
    .map(batch => ({ batch, at: entries.findLast(entry => entry.batch === batch).at,
      items: entries.filter(entry => entry.batch === batch && !entry.undoneAt) }))
    .filter(batch => batch.items.length);
}

async function planEntry(entry) {
  const current = await readConfig(entry.path);
  if (current === null) return { entry, action: 'skip', reason: 'file no longer exists' };
  if (sha256(current) !== entry.afterSha) {
    return { entry, action: 'skip', reason: `changed by something else since Apex CLI wrote it${entry.backup ? `. Restore ${entry.backup} manually` : ''}` };
  }
  const format = entry.format ?? 'json';
  if (entry.created) return { entry, action: 'remove', change: { path: entry.path, before: current, after: null, format } };
  if (entry.backup === null) return { entry, action: 'skip', reason: 'original backup was never recorded for this file' };
  const stored = await readConfig(entry.backup);
  if (stored === null || sha256(stored) !== entry.beforeSha) {
    return { entry, action: 'skip', reason: `original backup is missing (${entry.backup})` };
  }
  return { entry, action: 'restore', change: { path: entry.path, before: current, after: stored, format } };
}

// The newest setup with something left to restore. A setup whose remaining files can only be
// skipped would otherwise block every older one forever; reaching past it is safe because each
// restore still checks the file is exactly what Apex CLI wrote.
export async function planUndo(entries) {
  let newest = null;
  for (const batch of pendingBatches(entries)) {
    const plan = { ...batch, planned: await Promise.all(batch.items.map(planEntry)) };
    if (plan.planned.some(item => item.action !== 'skip')) return plan;
    newest ??= plan;
  }
  return newest;
}

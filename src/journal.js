import { mkdir, open, rename, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { readConfig, sha256 } from './config.js';

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

export async function writeJournal(path, entries) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const seen = [];
  for (const entry of entries) if (!seen.includes(entry.batch)) seen.push(entry.batch);
  const keep = new Set(seen.slice(-KEEP_BATCHES));
  const temporary = `${path}.apex-tmp-${randomUUID()}`;
  const handle = await open(temporary, 'wx', 0o600);
  try { await handle.writeFile(`${JSON.stringify(entries.filter(entry => keep.has(entry.batch)), null, 2)}\n`); await handle.sync(); }
  finally { await handle.close(); }
  try { await rename(temporary, path); }
  finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
}

export function newEntryFields(change, batch, at = new Date().toISOString()) {
  return {
    batch,
    at,
    path: change.path,
    format: change.format ?? 'json',
    created: change.before === null,
    beforeSha: change.before === null ? null : sha256(change.before),
    afterSha: sha256(change.after),
    backup: null,
    undoneAt: null,
  };
}

export async function markUndone(journalFile, entry, at = new Date().toISOString()) {
  const entries = await readJournal(journalFile);
  const found = entries.find(candidate => candidate.batch === entry.batch
    && candidate.path === entry.path && !candidate.undoneAt);
  if (!found) {
    throw new Error(`Journal has no pending entry for ${entry.path}. That file was already reverted, `
      + `so mark it undone by hand if you restored it yourself.`);
  }
  found.undoneAt = at;
  await writeJournal(journalFile, entries);
}

// One entry per saved file, not one journal rewrite per batch: a write that fails halfway
// still leaves everything already on disk undoable.
export async function appendEntry(journalFile, entry) {
  const entries = await readJournal(journalFile);
  entries.push(entry);
  await writeJournal(journalFile, entries);
}

export function latestBatch(entries) {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const { batch, at } = entries[index];
    const items = entries.filter(entry => entry.batch === batch && !entry.undoneAt);
    if (items.length) return { batch, at, items };
  }
  return null;
}

export async function planUndo(entries) {
  const batch = latestBatch(entries);
  if (!batch) return null;
  const planned = [];
  for (const entry of batch.items) {
    const current = await readConfig(entry.path);
    if (current === null) {
      planned.push({ entry, action: 'skip', reason: 'file no longer exists' });
      continue;
    }
    if (sha256(current) !== entry.afterSha) {
      planned.push({ entry, action: 'skip', reason: `changed by something else since Apex CLI wrote it${entry.backup ? `. Restore ${entry.backup} manually` : ''}` });
      continue;
    }
    if (entry.created) {
      planned.push({ entry, action: 'remove', current, change: { path: entry.path, before: current, after: null, format: entry.format ?? 'json' } });
      continue;
    }
    if (entry.backup === null) {
      planned.push({ entry, action: 'skip', reason: 'original backup was never recorded for this file' });
      continue;
    }
    const stored = await readConfig(entry.backup);
    if (stored === null || sha256(stored) !== entry.beforeSha) {
      planned.push({ entry, action: 'skip', reason: `original backup is missing (${entry.backup})` });
      continue;
    }
    planned.push({ entry, action: 'restore', current, change: { path: entry.path, before: current, after: stored, format: entry.format ?? 'json' } });
  }
  return { ...batch, planned };
}

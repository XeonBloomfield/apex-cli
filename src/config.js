import { lstat, readFile, mkdir, open, rename, unlink } from 'node:fs/promises';
import { dirname, resolve, parse as parsePath, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { parse, modify, applyEdits } from 'jsonc-parser';
import { parse as parseToml, stringify } from 'smol-toml';

export async function assertSafePath(path) {
  let current = parsePath(resolve(path)).root;
  for (const part of resolve(path).slice(current.length).split(/[\\/]/).filter(Boolean)) {
    current = join(current, part);
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink()) throw new Error(`Refusing symbolic link: ${current}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}

export async function readConfig(path) {
  await assertSafePath(path);
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function parseJson(text, path) {
  const errors = [];
  const value = parse(text ?? '{}', errors, { allowTrailingComma: true });
  if (errors.length || !object(value)) throw new Error(`Invalid JSON/JSONC object in ${path}; nothing overwritten.`);
  return value;
}

export function editJson(text, changes, path) {
  let next = text ?? '{}\n';
  for (const [keys, value] of changes) {
    let parent = parseJson(next, path);
    for (const key of keys.slice(0, -1)) {
      if (!Object.hasOwn(parent, key)) break;
      if (!object(parent[key])) throw new Error(`Expected object at ${keys.join('.')} in ${path}`);
      parent = parent[key];
    }
    next = applyEdits(next, modify(next, keys, value, {
      formattingOptions: { insertSpaces: true, tabSize: 2, eol: next.includes('\r\n') ? '\r\n' : '\n' },
    }));
  }
  parseJson(next, path);
  return next;
}

export function addToml(text, desired, path) {
  let existing;
  try { existing = parseToml(text ?? ''); }
  catch { throw new Error(`Invalid TOML in ${path}; nothing overwritten.`); }
  const missing = {};
  for (const [key, value] of Object.entries(desired)) {
    if (!Object.hasOwn(existing, key)) missing[key] = value;
    else if (!isDeepStrictEqual(existing[key], value)) {
      throw new Error(`Conflicting ${key} in ${path}. Review it manually; nothing overwritten.`);
    }
  }
  if (!Object.keys(missing).length) return text ?? '';
  const scalars = Object.fromEntries(Object.entries(missing).filter(([, value]) => !object(value)));
  const tables = Object.fromEntries(Object.entries(missing).filter(([, value]) => object(value)));
  // Scalars must precede any existing table, but never rewrite what is already there:
  // joining trimmed blocks keeps the diff to the lines that were actually appended.
  const parts = [];
  if (Object.keys(scalars).length) parts.push(stringify(scalars));
  if ((text ?? '').trim()) parts.push(text);
  if (Object.keys(tables).length) parts.push(stringify(tables));
  const next = `${parts.map(part => part.replace(/\s+$/, '')).join('\n\n')}\n`;
  parseToml(next);
  return next;
}

export function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export async function removeChange(change) {
  const { path, before } = change;
  await assertSafePath(path);
  if (await readConfig(path) !== before) throw new Error(`Configuration changed while planning: ${path}. Run undo again.`);
  await unlink(path);
}

export async function writeChange(change) {
  const { path, before, after } = change;
  if (before === after) return null;
  await assertSafePath(path);
  if (await readConfig(path) !== before) throw new Error(`Configuration changed while planning: ${path}. Run init again.`);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const suffix = randomUUID().slice(0, 8);
  const backup = before === null ? null : `${path}.apex-backup-${suffix}`;
  if (backup) {
    const handle = await open(backup, 'wx', 0o600);
    try { await handle.writeFile(before); } finally { await handle.close(); }
  }
  const temporary = `${path}.apex-tmp-${suffix}`;
  try {
    const handle = await open(temporary, 'wx', 0o600);
    try { await handle.writeFile(after); await handle.sync(); } finally { await handle.close(); }
    if (await readConfig(path) !== before) throw new Error(`Configuration changed before saving: ${path}`);
    await rename(temporary, path);
  } finally {
    await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
  return backup;
}

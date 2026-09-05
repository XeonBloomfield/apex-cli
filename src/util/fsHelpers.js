'use strict';

const fs = require('node:fs');
const path = require('node:path');

const backedUpThisRun = new Set();

function pathExists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

function readJsonIfExists(filePath) {
  if (!pathExists(filePath)) return null;
  const raw = fs.readFileSync(filePath, 'utf8');
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`${filePath} exists but is not valid JSON: ${err.message}`);
  }
}

function readTextIfExists(filePath) {
  return pathExists(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
}

function backupFile(filePath) {
  if (!pathExists(filePath) || backedUpThisRun.has(filePath)) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${filePath}.bak-${stamp}`;
  fs.copyFileSync(filePath, backupPath);
  backedUpThisRun.add(filePath);
  return backupPath;
}

function writeFileEnsuringDir(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

function writeJson(filePath, data) {
  writeFileEnsuringDir(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

module.exports = {
  pathExists,
  readJsonIfExists,
  readTextIfExists,
  backupFile,
  writeFileEnsuringDir,
  writeJson,
};

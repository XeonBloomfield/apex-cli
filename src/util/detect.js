'use strict';

const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { pathExists } = require('./fsHelpers');

function commandExists(cmd) {
  const finder = process.platform === 'win32' ? 'where' : 'which';
  try {
    execFileSync(finder, [cmd], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// Returns { major, minor, patch } parsed from `<cmd> <args>` output, or null
// if the command fails or its output doesn't contain a semver-like version.
function commandVersion(cmd, args = ['--version']) {
  try {
    const out = execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const match = out.match(/(\d+)\.(\d+)\.(\d+)/);
    if (!match) return null;
    return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
  } catch {
    return null;
  }
}

function dirExists(...segments) {
  return pathExists(path.join(...segments));
}

function anyAppPathExists(paths) {
  return paths.some((p) => pathExists(p));
}

function homeDir() {
  return os.homedir();
}

module.exports = {
  commandExists,
  commandVersion,
  dirExists,
  anyAppPathExists,
  homeDir,
};

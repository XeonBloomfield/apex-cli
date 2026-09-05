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
  dirExists,
  anyAppPathExists,
  homeDir,
};

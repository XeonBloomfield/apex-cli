'use strict';

const readline = require('node:readline');

function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function confirm(question, defaultYes = true) {
  if (!process.stdin.isTTY) return defaultYes;
  const hint = defaultYes ? 'Y/n' : 'y/N';
  const answer = (await ask(`${question} (${hint}) `)).toLowerCase();
  if (!answer) return defaultYes;
  return answer === 'y' || answer === 'yes';
}

// Char codes, spelled out numerically to avoid embedding raw control bytes in source.
const CODE_LF = 10;
const CODE_CR = 13;
const CODE_CTRL_C = 3;
const CODE_CTRL_D = 4;
const CODE_BACKSPACE = 8;
const CODE_DEL = 127;

function askHidden(question) {
  if (!process.stdin.isTTY) return ask(question);
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const stdin = process.stdin;
    process.stdout.write(question);

    let value = '';
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    const onData = (chunk) => {
      const char = chunk.toString();
      const code = char.charCodeAt(0);

      if (code === CODE_LF || code === CODE_CR) {
        stdin.setRawMode(false);
        stdin.removeListener('data', onData);
        process.stdout.write('\n');
        rl.close();
        resolve(value.trim());
        return;
      }

      if (code === CODE_CTRL_C || code === CODE_CTRL_D) {
        stdin.setRawMode(false);
        process.stdout.write('\n');
        process.exit(130);
        return;
      }

      if (code === CODE_BACKSPACE || code === CODE_DEL) {
        value = value.slice(0, -1);
        return;
      }

      value += char;
    };
    stdin.on('data', onData);
  });
}

module.exports = { ask, askHidden, confirm };

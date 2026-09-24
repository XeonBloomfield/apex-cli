#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'cli.js');

if (!existsSync(dist)) {
  process.stderr.write('Missing dist/cli.js bundle. Run `npm run build` first.\n');
  process.exit(1);
}

await import(pathToFileURL(dist).href);

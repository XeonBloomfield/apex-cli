import { homedir } from 'node:os';

const home = homedir();

// Shortens every occurrence, so paths embedded inside error messages are covered too.
export const shortPath = text => (home ? String(text).replaceAll(`${home}/`, '~/') : String(text));

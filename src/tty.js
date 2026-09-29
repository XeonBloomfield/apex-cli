import * as p from '@clack/prompts';

// clack's own definition of a usable terminal, so Apex and clack never disagree about prompting.
export const interactive = () => p.isTTY(process.stdout) && p.isTTY(process.stdin);

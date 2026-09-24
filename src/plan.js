import * as ui from './ui.js';
import { diffValues, unifiedDiff } from './diff.js';
import { interactive } from './tty.js';
import { shortPath } from './paths.js';

// Order matters: an explicit --apply outranks a non-interactive run, which only removes the
// prompt. --dry-run outranks everything because it must never touch files.
export function resolveMode({ dryRun, apply, nonInteractive }) {
  if (dryRun && apply) throw new Error('--dry-run and --apply cannot be combined.');
  if (dryRun) return 'preview';
  if (apply) return 'apply';
  return nonInteractive || !interactive() ? 'preview' : 'prompt';
}

export const MODE_NOTE = {
  preview: 'Preview only. Pass --apply to write, or run this in a terminal to confirm.',
  apply: 'Writing now (--apply).',
  prompt: 'Nothing is written until you confirm.',
};

export function describeFile(change, { secret, showDiff = true } = {}) {
  const status = change.before === change.after ? 'unchanged' : change.before === null ? 'create' : 'update';
  // An unreadable value here is a real problem, so it propagates to the one error channel instead
  // of being dressed up as a fake setting.
  const changes = status === 'unchanged' ? [] : diffValues({ before: change.before, after: change.after, format: change.format });
  return {
    path: change.path,
    status,
    changes,
    diff: status === 'unchanged' || !showDiff ? [] : unifiedDiff(shortPath(change.path), change.before, change.after, secret),
    change,
  };
}

export async function runWrites({ title, files, options, mode, prompt, hint, pending, write }) {
  ui.renderPlan(title, files, options);
  if (mode === 'preview') {
    ui.outro('Dry run complete. No files were changed.');
    return { applied: 0 };
  }
  if (!pending.length) {
    ui.outro('Already configured. Nothing to write.');
    return { applied: 0 };
  }
  if (mode === 'prompt' && !await ui.confirmApply(prompt, hint)) return { applied: 0 };
  // The plan above and the saved files below are two different claims, so they get a line of air.
  ui.plain('');
  let applied = 0;
  // Report each save as it lands: if a later write fails, the already-applied ones stay visible.
  for (const item of pending) {
    ui.success(await write(item));
    applied += 1;
  }
  return { applied };
}

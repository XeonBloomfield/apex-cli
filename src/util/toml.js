'use strict';

// Minimal helper to idempotently add/replace one top-level [section] block in a
// TOML file's raw text, without pulling in a TOML parser dependency. Good enough
// for the narrow, known-shape config files this CLI writes into.
function upsertTomlSection(existingText, sectionHeader, sectionBody) {
  const block = `[${sectionHeader}]\n${sectionBody}`;
  if (!existingText) return block.endsWith('\n') ? block : `${block}\n`;

  const headerLine = `[${sectionHeader}]`;
  const lines = existingText.split('\n');
  const startIdx = lines.findIndex((line) => line.trim() === headerLine);

  if (startIdx === -1) {
    const needsBlankLine = existingText.length > 0 && !existingText.endsWith('\n\n');
    const separator = existingText.endsWith('\n') ? (needsBlankLine ? '\n' : '') : '\n\n';
    const suffix = block.endsWith('\n') ? block : `${block}\n`;
    return `${existingText}${separator}${suffix}`;
  }

  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i += 1) {
    if (lines[i].trim().startsWith('[')) {
      endIdx = i;
      break;
    }
  }

  const before = lines.slice(0, startIdx);
  const after = lines.slice(endIdx);
  const newLines = [...before, ...block.split('\n').slice(0, -1), ...after];
  return `${newLines.join('\n').replace(/\n+$/, '\n')}`;
}

module.exports = { upsertTomlSection };

// One home for the rule "never show a credential", used by the value list, the diff and the JSON output.
export const REDACTED = '<redacted>';

// A raw token shorter than this is indistinguishable from ordinary words in a config file,
// so a short CALLSTACK_AUTH_TOKEN is matched only where a key says it is a secret.
const MIN_TOKEN = 12;

export const containsSecret = (text, secret) =>
  typeof text === 'string' && typeof secret === 'string' && secret.length >= MIN_TOKEN && text.includes(secret);

// Plural forms are included: over-redacting a display value is cheap, leaking one is not.
const SECRET_KEY = /^(?:.*_)?(?:key|token|secret|password|passwd|credential|auth|authorization)s?$/;

export function isSecretKey(key) {
  const leaf = key.split('.').at(-1).replace(/([^A-Z_])([A-Z])/g, (_, before, after) => `${before}_${after}`)
    .replaceAll('-', '_').toLowerCase();
  return SECRET_KEY.test(leaf);
}

export function isEnvReference(value) {
  return typeof value === 'string' && value.length <= 128
    && /^(?:\{env:[A-Za-z0-9_]+\}|\$[A-Za-z0-9_]+|[A-Z][A-Z0-9_]{2,})$/.test(value);
}

export function maskValue(key, value, secret) {
  if (typeof value !== 'string') return value;
  if (containsSecret(value, secret)) return REDACTED;
  return isSecretKey(key) && !isEnvReference(value) ? REDACTED : value;
}

const LITERAL = /^(?:true|false|null|-?\d+(?:\.\d+)?)$/;
const unquote = text => text.replace(/^["']|["']$/g, '');

// A value is a quoted scalar, a bare scalar, or a bracketed list; braces end a match instead of
// being consumed, so pairs nested inside an inline object are found by this same scan.
const SECRET_PAIR = /("(?:[^"\n]*)"|'[^'\n]+'|[A-Za-z0-9_.-]+)(\s*[:=]\s*)("(?:[^"\\\n]*)"|'(?:[^'\\\n]*)'|\[[^\]\n]*\]|[^,}\]\n{\[]+)/g;

// A list keeps its shape with each member redacted, so `"apiKeys": ["sk-1"]` stays readable JSON.
const QUOTED = /"(?:[^"\\\n]*)"|'[^'\\\n]*'/g;

function redactPair(key, value) {
  if (LITERAL.test(unquote(value)) || isEnvReference(unquote(value)) || !isSecretKey(unquote(key))) return null;
  return value.startsWith('[') ? value.replace(QUOTED, REDACTED) : REDACTED;
}

export function redactText(text, secret) {
  const redacted = text.replace(SECRET_PAIR, (whole, key, separator, value) =>
    redactPair(key, value) === null ? whole : `${key}${separator}${redactPair(key, value)}`);
  return containsSecret(redacted, secret) ? redacted.replaceAll(secret, REDACTED) : redacted;
}

// The machine-readable shape: same ops and keys, values run through the rules above.
export const maskChanges = (changes, secret) => changes.map(change => ({
  op: change.op,
  key: change.key,
  value: maskValue(change.key, change.value, secret),
  ...(change.op === 'replace' ? { oldValue: maskValue(change.key, change.oldValue, secret) } : {}),
}));

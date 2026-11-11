/**
 * ExtendScript strings for CEP shared storage.
 * Type-checked with `bun run typecheck:extendscript` (`tsconfig.extendscript.json`).
 * No runtime logic here  Estrings only.
 */

const STORAGE_NAMESPACE = "$__TYPLUS_STORAGE_V1";
const STORAGE_OBJECT = `${STORAGE_NAMESPACE}.$$__data`;

const CEP_SCRIPT_SET_TEMPLATE = `(function() {
  if (typeof ${STORAGE_NAMESPACE} === 'undefined') {
    ${STORAGE_NAMESPACE} = {};
  }
  if (typeof ${STORAGE_OBJECT} === 'undefined') {
    ${STORAGE_OBJECT} = {};
  }
  ${STORAGE_OBJECT}['__KEY_ESCAPED__'] = JSON.parse('__VALUE_ESCAPED__');
  return 'ok';
})();`;

const CEP_SCRIPT_GET_TEMPLATE = `(function() {
  if (typeof ${STORAGE_NAMESPACE} === 'undefined' || typeof ${STORAGE_OBJECT} === 'undefined') {
    return 'null';
  }
  var value = ${STORAGE_OBJECT}['__KEY_ESCAPED__'];
  return value === undefined ? 'null' : JSON.stringify(value);
})();`;

const CEP_SCRIPT_DELETE_TEMPLATE = `(function() {
  if (typeof ${STORAGE_NAMESPACE} !== 'undefined' && typeof ${STORAGE_OBJECT} !== 'undefined') {
    delete ${STORAGE_OBJECT}['__KEY_ESCAPED__'];
  }
  return 'deleted';
})();`;

/**
 * Issue #151 round-5: atomic monotonic-max write. The single evalScript
 * block reads the existing value, computes `max(existing, incoming)`,
 * writes the result, and returns the new value as JSON. Because the
 * ExtendScript engine is single-threaded and `evalScript` calls are
 * serialized on the AE main thread, no other JS surface (or another
 * `setClearedAt` call from the same surface) can interleave between
 * the read and the write inside this block. The previous JS-side
 * `get → max → set` sequence (round-4) had a TOCTOU race: two
 * surfaces could each observe the same `existing`, compute different
 * maxes, and the later write could rewind the boundary to a smaller
 * value. The atomic block makes the boundary monotonic-by-construction.
 *
 * Returns:
 *   `{ ok: true, value: <next>, previous: <existing|null> }`
 *   when the input is a finite non-negative number; otherwise
 *   `{ ok: false, reason: "invalid_input", value: null }`.
 */
const CEP_SCRIPT_MAX_SET_TEMPLATE = `(function() {
  if (typeof ${STORAGE_NAMESPACE} === 'undefined') {
    ${STORAGE_NAMESPACE} = {};
  }
  if (typeof ${STORAGE_OBJECT} === 'undefined') {
    ${STORAGE_OBJECT} = {};
  }
  var key = '__KEY_ESCAPED__';
  var incomingRaw = '__INCOMING_ESCAPED__';
  var incomingNum = Number(incomingRaw);
  if (!isFinite(incomingNum) || incomingNum < 0) {
    return JSON.stringify({ ok: false, reason: 'invalid_input', value: null, previous: null });
  }
  var existing = ${STORAGE_OBJECT}[key];
  var existingNum = (typeof existing === 'number' && isFinite(existing) && existing >= 0) ? existing : null;
  var next = (existingNum == null) ? incomingNum : Math.max(existingNum, incomingNum);
  ${STORAGE_OBJECT}[key] = next;
  return JSON.stringify({ ok: true, value: next, previous: existingNum });
})();`;

export const buildSetScript = (
	keyEscaped: string,
	valueEscaped: string,
): string =>
	CEP_SCRIPT_SET_TEMPLATE.replace(/__KEY_ESCAPED__/g, keyEscaped).replace(
		/__VALUE_ESCAPED__/g,
		valueEscaped,
	);

export const buildGetScript = (keyEscaped: string): string =>
	CEP_SCRIPT_GET_TEMPLATE.replace(/__KEY_ESCAPED__/g, keyEscaped);

export const buildDeleteScript = (keyEscaped: string): string =>
	CEP_SCRIPT_DELETE_TEMPLATE.replace(/__KEY_ESCAPED__/g, keyEscaped);

export const buildMaxSetScript = (
	keyEscaped: string,
	incomingEscaped: string,
): string =>
	CEP_SCRIPT_MAX_SET_TEMPLATE.replace(/__KEY_ESCAPED__/g, keyEscaped).replace(
		/__INCOMING_ESCAPED__/g,
		incomingEscaped,
	);

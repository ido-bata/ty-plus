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

/**
 * Issue #106: atomic cross-surface mutex acquire. The single evalScript
 * block reads the lock record, treats it as free when absent, stale
 * (older than `staleMs`), or already owned by the caller, and otherwise
 * returns 'held' without touching it. Because evalScript blocks are
 * serialized on the AE main thread, no other surface can interleave
 * between the check and the write — the same guarantee
 * `CEP_SCRIPT_MAX_SET_TEMPLATE` relies on.
 *
 * Returns 'acquired' or 'held'.
 */
const CEP_SCRIPT_LOCK_ACQUIRE_TEMPLATE = `(function() {
  if (typeof ${STORAGE_NAMESPACE} === 'undefined') {
    ${STORAGE_NAMESPACE} = {};
  }
  if (typeof ${STORAGE_OBJECT} === 'undefined') {
    ${STORAGE_OBJECT} = {};
  }
  var key = '__KEY_ESCAPED__';
  var owner = '__OWNER_ESCAPED__';
  var staleMs = __STALE_MS__;
  var now = (new Date()).getTime();
  var current = ${STORAGE_OBJECT}[key];
  if (current && typeof current === 'object' && current.owner !== owner) {
    var heldAt = typeof current.at === 'number' ? current.at : 0;
    if (now - heldAt < staleMs) {
      return 'held';
    }
  }
  ${STORAGE_OBJECT}[key] = { owner: owner, at: now };
  return 'acquired';
})();`;

/**
 * Owner-checked lock release. A surface may only clear a lock it still
 * owns, so a late release from a stale-takeover loser cannot free the
 * winner's lock.
 */
const CEP_SCRIPT_LOCK_RELEASE_TEMPLATE = `(function() {
  if (typeof ${STORAGE_NAMESPACE} !== 'undefined' && typeof ${STORAGE_OBJECT} !== 'undefined') {
    var key = '__KEY_ESCAPED__';
    var owner = '__OWNER_ESCAPED__';
    var current = ${STORAGE_OBJECT}[key];
    if (current && typeof current === 'object' && current.owner === owner) {
      delete ${STORAGE_OBJECT}[key];
    }
  }
  return 'released';
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

export const buildLockAcquireScript = (
	keyEscaped: string,
	ownerEscaped: string,
	staleMs: number,
): string =>
	CEP_SCRIPT_LOCK_ACQUIRE_TEMPLATE.replace(/__KEY_ESCAPED__/g, keyEscaped)
		.replace(/__OWNER_ESCAPED__/g, ownerEscaped)
		.replace(/__STALE_MS__/g, String(Math.max(0, Math.floor(staleMs))));

export const buildLockReleaseScript = (
	keyEscaped: string,
	ownerEscaped: string,
): string =>
	CEP_SCRIPT_LOCK_RELEASE_TEMPLATE.replace(
		/__KEY_ESCAPED__/g,
		keyEscaped,
	).replace(/__OWNER_ESCAPED__/g, ownerEscaped);

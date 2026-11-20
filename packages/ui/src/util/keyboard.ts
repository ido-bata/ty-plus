/**
 * Returns true when the keyboard event is part of an IME composition
 * (Japanese, Chinese, Korean, etc.). Callers should bail out of any
 * app-level shortcut or Enter-to-submit logic while this returns true.
 *
 * Two signals are accepted because the CEF runtime that ships with
 * Adobe CEP (Issue #349) inconsistently surfaces them:
 *  - `event.isComposing` is the standard `KeyboardEvent` flag.
 *  - `keyCode === 229` is the legacy fallback reported by some IMEs
 *    when the actual character has not yet been resolved.
 *
 * Both native `KeyboardEvent` and React's synthetic event expose
 * `isComposing` directly, so a single structural type covers both.
 */
export function isIMEComposing(event: {
	isComposing?: boolean;
	keyCode?: number;
}): boolean {
	return event.isComposing === true || event.keyCode === 229;
}

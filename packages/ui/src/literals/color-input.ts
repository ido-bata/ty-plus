/**
 * `<input type="color">` requires a concrete `#rrggbb` value — `var(--…)`
 * is not a valid input value — so the fallback for unparsable colors must
 * stay a literal.
 */

export const COLOR_INPUT_FALLBACK_HEX = "#000000";

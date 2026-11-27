/**
 * Concrete fallbacks for workspace background CSS generation.
 *
 * `hexToRgba` (background/style.ts) must bake layer opacity into an
 * `rgba()` triplet, which a `var()` cannot provide — so these mirror the
 * `color-ws-*` tokens in `design-tokens-defaults.ts` as concrete hex.
 * They are render fallbacks for missing layer data, not user preset
 * colors (those live in `layer-colors.ts`).
 */
export const BACKGROUND_RENDER_BG_DEFAULT = "#1d1d1d";
export const BACKGROUND_RENDER_PATTERN_FG = "#383838";

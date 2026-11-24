/**
 * `settings.ui.*` color defaults — persisted user preferences compared
 * against these values to detect customization (see ui-theme-sync.ts).
 * They are setting data, not theme tokens: users edit them as hex and the
 * values intentionally differ from the shipped theme palette.
 */

export const DEFAULT_UI_ACCENT_COLOR = "#5886ff";
export const DEFAULT_UI_TEXT_COLOR = "#f0f0f0";
export const DEFAULT_UI_WIDGET_BG_COLOR = "#1a1a1a";
export const DEFAULT_UI_PANEL_BG_COLOR = "#0f0f0f";

/** Neutral swatch shown by the token editor when a color token has no value. */
export const COLOR_TOKEN_EMPTY_VALUE = "#000000";

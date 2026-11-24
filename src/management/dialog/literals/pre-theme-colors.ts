/**
 * Colors for dialog surfaces that can render before the theme token
 * pipeline (`:root` custom properties) is applied. They must stay concrete
 * values — `var(--…)` would be unresolved at that point.
 */

export const PRE_THEME_MUTED_COLOR = "#666";
export const PRE_THEME_CODE_BG_COLOR = "#f0f0f0";
export const DIALOG_LOADING_COLOR = "#888";

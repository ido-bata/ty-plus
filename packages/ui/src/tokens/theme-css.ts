/**
 * Bridges `--color-*` semantic tokens to the `--ty-*` custom properties.
 * Mirrors the `@theme` block in `src/management/style/theme.css`; the CEP
 * injection side always emits this bridge because bundle CSS ordering can
 * leave `--color-*` unset on older CEF builds. Keep in sync with theme.css.
 */
const SEMANTIC_COLOR_BRIDGE = `
  --color-surface-panel: var(--ty-surface-panel);
  --color-surface-widget: var(--ty-surface-widget);
  --color-surface-dialog: var(--ty-surface-dialog);
  --color-surface-overlay: var(--ty-surface-overlay);
  --color-text-primary: var(--ty-text-primary);
  --color-text-muted: var(--ty-text-muted);
  --color-text-accent: var(--ty-text-accent);
  --color-border-subtle: var(--ty-border-subtle);
  --color-border-strong: var(--ty-border-strong);
  /* CEP bridge must stay parseable on older CEF builds. */
  --color-border-default: var(--ty-border-strong);
  --color-interactive-hover: var(--ty-interactive-hover);
  --color-interactive-active: var(--ty-interactive-active);
  --color-interactive-focus: var(--ty-interactive-focus);
  --color-status-success: var(--ty-status-success);
  --color-status-warning: var(--ty-status-warning);
  --color-status-error: var(--ty-status-error);
  --radius-shell: var(--ty-shell-radius);
  --radius-shell-sm: var(--ty-shell-radius-sm);
  --radius-shell-lg: var(--ty-shell-radius-lg);
  --shadow-control-panel: var(--ty-shadow-control-panel);
  --text-shell: var(--ty-shell-text-size);
  --text-shell-sm: var(--ty-shell-text-size-sm);
  --text-xs: var(--ty-text-size-xs);
  --text-2xs: var(--ty-text-size-2xs);
  --text-display-sm: var(--ty-text-size-display-sm);
  --max-w-3xl: var(--ty-max-w-3xl);
`.trim();

export const themeVarsToCssBlock = (theme: Record<string, string>): string => {
	const lines = Object.entries(theme).map(
		([key, val]) => `  --${key}: ${val};`,
	);
	return `:root {\n${lines.join("\n")}\n  ${SEMANTIC_COLOR_BRIDGE.replace(/\n/g, "\n  ")}\n}`;
};

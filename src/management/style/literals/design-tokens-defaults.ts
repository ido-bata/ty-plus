/**
 * Fixed default values for design (the sole literal source body).
 * `mergePanelTheme` injects this map into `:root`.
 * Do not place hex / numeric literals in other files.
 */

/**
 * Tailwind spacing scale values (defaults only).
 * Mirrored to PandaCSS spacing tokens in `panda.config.ts` so the same
 * numeric values are usable from Panda recipes. The `--ty-space-*`
 * CSS variables generated below stay in place — components reference
 * them directly via `length:var(--ty-space-N)` / `rounded-(--ty-space-N)`
 * class names, and Tailwind/Panda do not own that surface.
 */
const TW_SPACING_DEFAULTS: Record<string, string> = {
	"0": "0px",
	px: "1px",
	"0.5": "0.125rem",
	"0.75": "0.1875rem",
	"1": "0.25rem",
	"1.25": "0.3125rem",
	"1.5": "0.375rem",
	"1.75": "0.4375rem",
	"2": "0.5rem",
	"2.25": "0.5625rem",
	"2.5": "0.625rem",
	"2.75": "0.6875rem",
	"3": "0.75rem",
	"3.25": "0.8125rem",
	"3.5": "0.875rem",
	"3.75": "0.9375rem",
	"4": "1rem",
	"4.5": "1.125rem",
	"5": "1.25rem",
	"5.5": "1.375rem",
	"6": "1.5rem",
	"6.5": "1.625rem",
	"7": "1.75rem",
	"7.5": "1.875rem",
	"8": "2rem",
	"8.5": "2.125rem",
	"9": "2.25rem",
	"9.5": "2.375rem",
	"10": "2.5rem",
	"10.5": "2.625rem",
	"11": "2.75rem",
	/** 11.25x0.25rem -- 45px (same key semantics as Tailwind default) */
	"11.25": "2.8125rem",
	"11.5": "2.875rem",
	"12": "3rem",
	"12.5": "3.125rem",
	"13.5": "3.375rem",
	"13.75": "3.4375rem",
	"14": "3.5rem",
	"16": "4rem",
	"17.5": "4.375rem",
	"20": "5rem",
	"22.5": "5.625rem",
	"24": "6rem",
	"26.25": "6.5625rem",
	"28": "7rem",
	"29": "7.25rem",
	"30": "7.5rem",
	"32": "8rem",
	"32.5": "8.125rem",
	"35": "8.75rem",
	"36": "9rem",
	"40": "10rem",
	"42": "10.5rem",
	"44": "11rem",
	/** 45x0.25rem - 180px */
	"45": "11.25rem",
	"48": "12rem",
	"50": "12.5rem",
	"52": "13rem",
	"56": "14rem",
	"60": "15rem",
	"64": "16rem",
	/** 55x0.25rem - 220px */
	"55": "13.75rem",
	/** 70x0.25rem - 280px */
	"70": "17.5rem",
	/** 90x0.25rem - 360px */
	"90": "22.5rem",
	/** 105x0.25rem - 420px */
	"105": "26.25rem",
	/** 130x0.25rem - 520px */
	"130": "32.5rem",
	"72": "18rem",
	"80": "20rem",
	"96": "24rem",
	/** 180x0.25rem - 720px */
	"180": "45rem",
	/** 200x0.25rem - 800px */
	"200": "50rem",
};

/** Tailwind keys ("1.5" etc.) to ty-space-1-5 token name format */
const twSpacingKeyToTyName = (key: string): string =>
	`ty-space-${key.replace(/\./g, "-")}`;

const buildTySpaceTokens = (): Record<string, string> => {
	const o: Record<string, string> = {};
	for (const [k, v] of Object.entries(TW_SPACING_DEFAULTS)) {
		o[twSpacingKeyToTyName(k)] = v;
	}
	return o;
};

/** CSS custom property names (without leading `--`) -> values */
export const DESIGN_TOKENS_DEFAULTS: Record<string, string> = {
	/* RGB channels (for rgba(var(--text-r), …)) */
	"text-r": "255",
	"text-g": "255",
	"text-b": "255",
	"accent-r": "88",
	"accent-g": "166",
	"accent-b": "255",

	/*
	 * 4th argument of rgba(var(--text-r), …, var(--ty-opacity-…)).
	 * Settings UI / presets can batch-adjust workspace shading by replacing only these keys.
	 */
	"ty-opacity-text-main": "1",
	"ty-opacity-text-muted": "0.55",
	"ty-opacity-action-primary": "1",
	"ty-opacity-border-default": "0.11",

	"ty-opacity-ws-scrollbar-hover": "0.14",
	"ty-opacity-ws-scrollbar-thumb": "0.12",
	"ty-opacity-ws-scrollbar-thumb-strong": "0.22",
	"ty-opacity-ws-accent-outline": "1",
	"ty-opacity-ws-widget-drag": "0.9",
	"ty-opacity-ws-search-hover": "0.08",
	"ty-opacity-ws-search-focus": "0.12",
	"ty-opacity-ws-search-icon": "0.6",
	"ty-opacity-ws-search-placeholder": "0.4",
	"ty-opacity-ws-widget-chrome-hover": "0.08",
	"ty-opacity-ws-section-label": "0.5",
	"ty-opacity-ws-align-hover": "0.1",
	"ty-opacity-ws-align-active": "0.15",
	"ty-opacity-ws-target-row-border": "0.08",
	"ty-opacity-ws-target-hover": "0.05",
	"ty-opacity-ws-target-active-bg": "0.1",
	"ty-opacity-ws-note-placeholder": "0.3",
	"ty-opacity-ws-note-focus-border": "0.4",
	"ty-opacity-ws-note-focus-ring": "0.15",
	"ty-opacity-ws-anchor-hover": "0.03",
	"ty-opacity-ws-anchor-active": "0.06",
	"ty-opacity-ws-anchor-grid-line": "0.35",
	"ty-opacity-ws-anchor-grid-line-hover": "0.75",
	"ty-opacity-ws-anchor-center-line": "0.9",
	"ty-opacity-ws-tbtn-bg": "0.05",
	"ty-opacity-ws-tbtn-hover": "0.1",
	"ty-opacity-ws-tbtn-active-accent": "0.15",
	"ty-opacity-ws-tfont-border": "0.08",
	"ty-opacity-ws-tfont-focus-border": "0.5",
	"ty-opacity-ws-info-empty": "0.3",
	"ty-opacity-ws-info-footer-border": "0.06",
	"ty-opacity-ws-info-dot": "0.2",
	"ty-opacity-ws-statusbar-border": "0.06",
	"ty-opacity-ws-sb-label": "0.5",
	"ty-opacity-ws-sb-dot": "0.2",
	"ty-opacity-ws-sb-btn-icon": "0.55",
	"ty-opacity-ws-sb-btn-hover-bg": "0.1",
	"ty-opacity-ws-sb-btn-hover-icon": "0.9",
	"ty-opacity-ws-disabled": "0.25",
	"ty-opacity-ws-snap-label": "0.5",
	"ty-opacity-ws-snap-label-hover": "0.9",
	"ty-opacity-ws-snap-panel-border": "0.12",
	"ty-opacity-ws-snap-restore-text": "0.8",
	"ty-opacity-ws-snap-restore-hover-bg": "0.08",
	"ty-opacity-ws-snap-del-icon": "0.3",
	"ty-opacity-ws-snap-del-hover-text": "0.8",
	"ty-opacity-ws-snap-empty": "0.3",

	/** 4th argument of rgba(var(--text-r), …) (general thin fill) */
	"ty-opacity-ws-text-fill-subtle": "0.04",
	/** Mid-alpha for accent borders / hover */
	"ty-opacity-ws-accent-border-mid": "0.28",
	"ty-opacity-ws-accent-fill-mid": "0.08",

	/* Quick bar: archive CATEGORY_COLORS (RGB channels) */
	"ty-qa-cat-file-r": "59",
	"ty-qa-cat-file-g": "130",
	"ty-qa-cat-file-b": "246",
	"ty-qa-cat-edit-r": "245",
	"ty-qa-cat-edit-g": "158",
	"ty-qa-cat-edit-b": "11",
	"ty-qa-cat-view-r": "16",
	"ty-qa-cat-view-g": "185",
	"ty-qa-cat-view-b": "129",
	"ty-qa-cat-help-r": "139",
	"ty-qa-cat-help-g": "92",
	"ty-qa-cat-help-b": "246",
	"ty-qa-cat-create-r": "217",
	"ty-qa-cat-create-g": "70",
	"ty-qa-cat-create-b": "239",

	/* White ink transparency steps (common tones for debug UI etc.) */
	"color-ty-ink-02": "rgb(255 255 255 / 0.02)",
	"color-ty-ink-03": "rgb(255 255 255 / 0.03)",
	"color-ty-ink-04": "rgb(255 255 255 / 0.04)",
	"color-ty-ink-05": "rgb(255 255 255 / 0.05)",
	"color-ty-ink-06": "rgb(255 255 255 / 0.06)",
	"color-ty-ink-08": "rgb(255 255 255 / 0.08)",
	"color-ty-ink-10": "rgb(255 255 255 / 0.1)",
	"color-ty-ink-12": "rgb(255 255 255 / 0.12)",
	"color-ty-ink-14": "rgb(255 255 255 / 0.14)",
	"color-ty-ink-15": "rgb(255 255 255 / 0.15)",
	"color-ty-ink-18": "rgb(255 255 255 / 0.18)",
	"color-ty-ink-20": "rgb(255 255 255 / 0.2)",
	"color-ty-ink-22": "rgb(255 255 255 / 0.22)",
	"color-ty-ink-25": "rgb(255 255 255 / 0.25)",
	"color-ty-ink-30": "rgb(255 255 255 / 0.3)",
	"color-ty-ink-35": "rgb(255 255 255 / 0.35)",
	"color-ty-ink-40": "rgb(255 255 255 / 0.4)",
	"color-ty-ink-45": "rgb(255 255 255 / 0.45)",
	"color-ty-ink-60": "rgb(255 255 255 / 0.6)",
	"color-ty-ink-70": "rgb(255 255 255 / 0.7)",
	"color-ty-ink-75": "rgb(255 255 255 / 0.75)",
	"color-ty-ink-90": "rgb(255 255 255 / 0.9)",

	/* Workspace chrome  Emonochrome with 1d1d1d base */
	"color-ty-bg-app": "#1d1d1d",
	"color-ty-bg-surface": "#252525",
	"color-ty-widget-bg": "#1e1e1e",
	"color-ty-widget-border": "#0e0e0e",
	"color-ty-widget-border-strong": "#000000",
	"color-ty-live": "#b0b0b0",
	"color-ty-snap-panel": "#252525",
	"color-ty-shadow-15": "rgb(0 0 0 / 0.15)",
	"color-ty-shadow-25": "rgb(0 0 0 / 0.25)",
	"color-ty-shadow-30": "rgb(0 0 0 / 0.3)",
	"color-ty-shadow-40": "rgb(0 0 0 / 0.4)",
	"color-ty-shadow-50": "rgb(0 0 0 / 0.5)",
	"color-ty-accent-border": "rgba(180 180 180 / 0.6)",
	"color-ty-accent-bg": "rgba(180 180 180 / 0.12)",

	/* Debug overlay / console column width (timestamp column) */
	"ty-dbg-ts-width": "58px",

	/* Debug overlay */
	"color-ty-dbg-panel": "#1a1a1a",
	"color-ty-dbg-header": "#141414",
	"color-ty-dbg-text": "#ccc",
	"color-ty-dbg-input": "#e0e0e0",
	"color-ty-dbg-focus-outline": "rgb(160 160 160 / 0.5)",
	"color-ty-dbg-log-level": "rgb(255 255 255 / 0.35)",
	"color-ty-dbg-log-text": "rgb(255 255 255 / 0.75)",
	"color-ty-dbg-debug": "#b0b0b0",
	"color-ty-dbg-info-level": "#b0b0b0",
	"color-ty-dbg-info-text": "#c8c8c8",
	"color-ty-dbg-warn-level": "#c0c0c0",
	"color-ty-dbg-warn-text": "#d0d0d0",
	"color-ty-dbg-warn-bg": "rgb(180 180 180 / 0.04)",
	"color-ty-dbg-error-level": "#c8c8c8",
	"color-ty-dbg-error-text": "#e0e0e0",
	"color-ty-dbg-error-bg": "rgb(180 180 180 / 0.06)",

	/* Debug console panel */
	"color-ty-dc-root": "#141414",
	"color-ty-dc-header": "#1a1a1a",
	"color-ty-dc-auto-active": "#b0b0b0",
	"color-ty-dc-remote": "rgb(160 160 160 / 0.5)",
	"color-ty-dc-row-focus": "rgb(160 160 160 / 0.4)",

	/* CEP dialog / media shells  Emonochrome */
	"color-ty-surface-bg-a": "#1a1a1a",
	"color-ty-surface-bg-b": "#141414",
	"color-ty-surface-text": "#e0e0e0",
	"color-ty-surface-glow": "rgb(160 160 160 / 0.15)",
	"color-ty-surface-card-border": "rgb(160 160 160 / 0.16)",
	"color-ty-surface-card-bg": "rgb(26 26 26 / 0.9)",
	"color-ty-surface-card-shadow": "rgb(0 0 0 / 0.28)",
	"color-ty-surface-action-bg": "rgb(255 255 255 / 0.04)",
	"color-ty-surface-action-border": "rgb(255 255 255 / 0.12)",
	"color-ty-surface-frame-bg": "#101010",
	"color-ty-surface-muted": "#a0a0a0",
	"color-ty-surface-dashed-border": "rgb(160 160 160 / 0.2)",
	"color-ty-surface-detail-bg": "rgb(255 255 255 / 0.03)",
	"color-ty-surface-detail-strong": "#d0d0d0",

	/*
	 * Semantic token aliases (Phase 2 Task4)
	 * Adds meaning-based names while keeping existing tokens.
	 */
	"ty-surface-panel": "var(--color-ty-bg-app)",
	"ty-surface-widget": "var(--color-ty-widget-bg)",
	"ty-surface-dialog": "var(--color-ty-bg-surface)",
	"ty-surface-overlay": "var(--color-ty-ink-04)",

	"ty-text-primary":
		"rgba(var(--text-r), var(--text-g), var(--text-b), var(--ty-opacity-text-main))",
	"ty-text-muted":
		"rgba(var(--text-r), var(--text-g), var(--text-b), var(--ty-opacity-text-muted))",
	"ty-text-accent":
		"rgba(var(--accent-r), var(--accent-g), var(--accent-b), var(--ty-opacity-action-primary))",

	"ty-border-subtle":
		"rgba(var(--text-r), var(--text-g), var(--text-b), var(--ty-opacity-border-default))",
	"ty-border-strong": "var(--color-ty-widget-border)",
	"ty-border-surface": "#0e0e0e",

	"ty-interactive-hover": "var(--color-ty-ink-08)",
	"ty-interactive-active": "var(--color-ty-ink-12)",
	"ty-interactive-focus":
		"rgba(var(--accent-r), var(--accent-g), var(--accent-b), 0.45)",

	/* Shell (packages/workspace inline CSS) */
	"color-ty-shell-canvas-start": "#1a1a1a",
	"color-ty-shell-canvas-end": "#141414",
	"color-ty-shell-panel": "rgba(22, 22, 22, 0.92)",
	"color-ty-shell-panel-strong": "rgba(20, 20, 20, 0.98)",
	"color-ty-shell-border": "rgba(160, 160, 160, 0.16)",
	"color-ty-shell-text": "#e0e0e0",
	"color-ty-shell-muted": "#a0a0a0",
	"color-ty-shell-warm": "#c0c0c0",
	"color-ty-shell-success": "#b0b0b0",
	"color-ty-body-accent-top": "rgba(160, 160, 160, 0.2)",
	"color-ty-body-accent-bottom": "rgba(160, 160, 160, 0.15)",

	/* Dialog error display */
	"color-ty-dialog-error-text": "#e0e0e0",
	"color-ty-dialog-error-bg": "#1d1d1d",
	"color-ty-dialog-error-accent": "#c0c0c0",

	/* Media surface inline */
	"color-ty-media-frame-bg": "#141414",
	"color-ty-media-text": "#e0e0e0",

	/* Dialog error fallback */
	"color-ty-error-fallback": "#c0c0c0",

	/* Workspace error display */
	"color-ty-ws-error-text": "#e0e0e0",
	"color-ty-ws-error-bg": "#1d1d1d",
	"color-ty-ws-error-border": "#3a3a3a",

	/* Debug console inline display */
	"color-ty-debug-null": "#888888",
	"color-ty-debug-string": "#aaaaaa",
	"color-ty-debug-url": "#888888",
	"color-ty-debug-error": "#c8c8c8",
	"color-ty-debug-link": "#a0a0a0",
	"color-ty-debug-empty": "#888888",
	"color-ty-debug-object": "#888888",

	/* Debug console log level colors */
	"color-ty-debug-log": "var(--ty-text-muted)",
	"color-ty-debug-info": "#b0b0b0",
	"color-ty-debug-warn": "#c0c0c0",
	"color-ty-debug-error-level": "#c8c8c8",

	/* Message / error display inline */
	"color-ty-msg-error-text": "#c8c8c8",
	"color-ty-msg-error-bg": "rgba(180 180 180 0.1)",

	/* Settings status indicators */
	"color-ty-status-success": "#4ade80",
	"color-ty-status-error": "#f87171",

	/* Accent alpha for workspace shell badges/actions */
	"color-ty-accent-fill":
		"rgba(var(--accent-r), var(--accent-g), var(--accent-b), 0.12)",
	"color-ty-accent-fill-mid":
		"rgba(var(--accent-r), var(--accent-g), var(--accent-b), 0.14)",
	"color-ty-accent-fill-strong":
		"rgba(var(--accent-r), var(--accent-g), var(--accent-b), 0.04)",
	"color-ty-accent-border-mid":
		"rgba(var(--accent-r), var(--accent-g), var(--accent-b), 0.24)",
	"color-ty-accent-border-strong":
		"rgba(var(--accent-r), var(--accent-g), var(--accent-b), 0.45)",
	"color-ty-accent-border-topbar":
		"rgba(var(--accent-r), var(--accent-g), var(--accent-b), 0.3)",

	/* Accent main (monochrome gray) */
	"color-ty-accent": "#58a6ff",

	"ty-widget-gap": "6px",
	"ty-widget-header-height": "26px",

	"ty-status-success": "#b0b0b0",
	"ty-status-warning": "#c0c0c0",
	"ty-status-error": "#c8c8c8",

	/* Workspace background defaults */
	"color-ws-bg-default": "#1d1d1d",
	"color-ws-pattern-fg": "#383838",
	"color-ws-pattern-bg": "transparent",
	"color-ws-transparent": "rgba(0, 0, 0, 0)",

	/* Icon default colors (shared across workspace + CEP shell) */
	"color-ty-icon-bg": "#2b2b2b",
	"color-ty-icon-fg": "#e0e0e0",

	/* Shell icon field / preset dialog colors */
	"color-ty-shell-icon-bg": "#1e293b",
	"color-ty-shell-icon-fg": "#f1f5f9",

	/* Background panel layer defaults */
	"color-ty-ws-layer-color": "#1e1e1e",
	"color-ty-ws-pattern-fg": "#383838",

	/* Monaco editor background */
	"color-ty-shell-monaco-bg": "#1e1e1e",

	/* Compatibility aliases for existing React component references */
	"color-ty-surface-01": "var(--ty-surface-dialog)",
	"color-ty-surface-02": "var(--ty-surface-overlay)",
	"color-ty-text-primary": "var(--ty-text-primary)",
	"color-ty-text-secondary": "var(--ty-text-muted)",
	"color-ty-border-01": "var(--ty-border-subtle)",

	/*
	 * CEP Settings / shell UI boundary (shared with Tailwind. for workspace gradual replacement)
	 */
	"ty-shell-pad-inline": "8px",
	/** AE panel assumption: large radius looks unstable, so keep it restrained */
	"ty-shell-radius": "4px",
	"ty-shell-radius-sm": "3px",
	/** Cards / floating panels (slightly looser than control) */
	"ty-shell-radius-lg": "6px",
	/** Full rounded (scrollbar / handles) */
	"ty-radius-full": "9999px",
	/** Button-like nearly circular (media surfaces etc.) */
	"ty-radius-pill-md": "999px",
	"ty-shell-duration": "180ms",
	"ty-transition-fast": "150ms",
	"ty-transition-micro": "100ms",
	"ty-transition-panel": "180ms",
	"ty-shell-space": "8px",
	"ty-shell-text-size": "12px",
	/** Labels / supplementary text / compact input */
	"ty-shell-text-size-sm": "11px",
	/** Auxiliary labels / grid numbers (shared workspace / debug console) */
	"ty-text-size-xs": "10px",
	"ty-text-size-2xs": "9px",
	"ty-text-size-3xs": "8px",
	/** Intermediate size (settings sheet headings etc.) */
	"ty-text-size-md": "14px",
	"ty-text-size-body": "15px",
	/** Timer digits etc. */
	"ty-text-size-display-sm": "18px",
	/** Decimal font for grid dimension display */
	"ty-text-size-grid-measure": "10.5px",
	/** Prompts / emphasis (dc-prompt etc.) */
	"ty-text-size-prompt": "13px",
	"ty-shell-border-width": "1px",
	/** Modeless column max width (aligned with 480-1200px slider. In narrow panels, fits via min of max-width and 100%) */
	"ty-shell-settings-dialog-max-width": "880px",
	/** Comfortable max width for settings / form body (column is 100% but content caps at this) */
	"ty-shell-content-max-width": "48rem",

	/** Workspace / settings preview shared (scrollbar actual size / one side of grid background) */
	"ty-ws-scrollbar-width": "5px",
	"ty-ws-grid-cell": "32px",
	/** 1 grid cell (`--cell` default. `render.ts` may override) */
	"ty-ws-cell": "48px",

	/** Fluid values for note / grid (workspace.css) */
	/** Avoid vw dependency in CEP (panel inner dimension = viewport, appearance changes in steps when crossing thresholds) */
	"ty-ws-note-font-clamp": "12px",
	"ty-ws-note-padding-clamp": "clamp(8px, 2%, 12px)",
	"ty-ws-grid-padding-clamp": "clamp(6px, 2%, 12px)",
	"ty-ws-keyboard-max-w-clamp": "min(360px, 100%)",

	/** Overscan columns / rows (buffer rendered beyond visible area) */
	"ty-ws-overscan-cols": "1",
	"ty-ws-overscan-rows": "1",

	/** Placement surface (placement item background) */
	"ty-ws-placement-surface": "var(--color-ty-widget-bg)",

	/** Outside ring width (box-shadow; grows outward, no layout squeeze) */
	"ty-ws-gridcell-ring-width": "1px",
	"ty-ws-gridcell-ring-width-selected": "1px",

	/**
	 * Default placement tile edge: darker than `surface-widget` (`--color-ty-widget-bg`).
	 * Avoid `color-mix(...)` here — older CEF builds drop it and borders fall back to `currentColor`.
	 */
	"color-ty-ws-gridcell-ring-border": "var(--color-ty-widget-border)",

	"ty-opacity-ws-gridcell-ring-border": "1",

	/** Selected: default accent (blue channel from `accent-r` / `accent-g` / `accent-b`). */
	"color-ty-ws-gridcell-ring-border-selected":
		"rgb(var(--accent-r), var(--accent-g), var(--accent-b))",

	"ty-opacity-ws-gridcell-ring-border-selected": "1",

	/** Selection rectangle fill/border */
	"color-ty-ws-selrect-border": "var(--color-ty-widget-border-strong)",
	"ty-opacity-ws-selrect-border": "1",
	"color-ty-ws-selrect-fill":
		"rgba(var(--text-r), var(--text-g), var(--text-b), 0.06)",
	"ty-opacity-ws-selrect-fill": "1",

	/** Drag preview opacity */
	"ty-opacity-ws-drag-preview": "0.9",

	/** Grid cell / gap / radius */
	"ty-ws-grid-gap": "4px",
	"ty-ws-grid-radius": "var(--ty-shell-radius-sm)",

	/** Outline negative offset (selection border) */
	"ty-outline-offset-inset": "-1px",
	/** Ultra-tight letter spacing (pixel units) */
	"ty-letter-spacing-pixel-tight": "0.5px",

	/** Media surface / cards (cep-surfaces) */
	"ty-surface-card-radius": "8px",
	"ty-surface-media-min-height": "320px",
	"ty-surface-detail-radius": "6px",

	/** base.css typography / layout (for :root outside Tailwind) */
	"ty-base-line-height": "1.45",
	"ty-base-letter-spacing": "0.01em",
	"ty-base-font-family":
		'system-ui, "Segoe UI", "Helvetica Neue", ui-sans-serif, sans-serif',

	/** CEP panel minimum size (`base.css` html.ty-plus-cep-shell) */
	"ty-cep-shell-min-width": "280px",
	"ty-cep-shell-min-height": "360px",

	/** Floating shadows for control panels etc. (for `box-shadow`. Color refers to separate token) */
	"ty-shadow-control-panel": "0 8px 24px var(--color-ty-shadow-40)",

	/** For preview / dialog max-width */
	"ty-max-w-3xl": "48rem",

	...buildTySpaceTokens(),
};

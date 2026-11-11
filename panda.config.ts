/**
 * PandaCSS config — bridge from current `:root` CSS variables (--ty-*) injected
 * by `mergePanelTheme` into PandaCSS tokens.
 *
 * The shell builds CSS vars from `management/style/literals/design-tokens-defaults.ts`,
 * so every token here references those existing variables instead of duplicating
 * literals. New tokens follow the same convention: define the CSS var first,
 * then reference it from Panda.
 */
import { defineConfig, defineTokens } from "@pandacss/dev";

const colors = defineTokens.colors({
	/* Surface tokens — read by mergePanelTheme :root. */
	surface: {
		panel: { value: "var(--ty-surface-panel)" },
		widget: { value: "var(--ty-surface-widget)" },
		dialog: { value: "var(--ty-surface-dialog)" },
		overlay: { value: "var(--ty-surface-overlay)" },
	},
	text: {
		primary: { value: "var(--ty-text-primary)" },
		muted: { value: "var(--ty-text-muted)" },
		accent: { value: "var(--ty-text-accent)" },
	},
	border: {
		subtle: { value: "var(--ty-border-subtle)" },
		strong: { value: "var(--ty-border-strong)" },
		surface: { value: "var(--ty-border-surface)" },
		default: { value: "var(--ty-border-surface)" },
		input: { value: "var(--ty-border-surface)" },
	},
	interactive: {
		hover: { value: "var(--ty-interactive-hover)" },
		active: { value: "var(--ty-interactive-active)" },
		focus: { value: "var(--ty-interactive-focus)" },
	},
	status: {
		success: { value: "var(--ty-status-success)" },
		warning: { value: "var(--ty-status-warning)" },
		error: { value: "var(--ty-status-error)" },
	},
	shadow: {
		"control-panel": { value: "var(--ty-shadow-control-panel)" },
	},
	/* Debug overlay / console tokens */
	dbg: {
		panel: { value: "var(--color-ty-dbg-panel)" },
		header: { value: "var(--color-ty-dbg-header)" },
		text: { value: "var(--color-ty-dbg-text)" },
		input: { value: "var(--color-ty-dbg-input)" },
		"focus-outline": { value: "var(--color-ty-dbg-focus-outline)" },
		"log-level": { value: "var(--color-ty-dbg-log-level)" },
		"log-text": { value: "var(--color-ty-dbg-log-text)" },
		debug: { value: "var(--color-ty-dbg-debug)" },
		"info-level": { value: "var(--color-ty-dbg-info-level)" },
		"info-text": { value: "var(--color-ty-dbg-info-text)" },
		"warn-level": { value: "var(--color-ty-dbg-warn-level)" },
		"warn-text": { value: "var(--color-ty-dbg-warn-text)" },
		"warn-bg": { value: "var(--color-ty-dbg-warn-bg)" },
		"error-level": { value: "var(--color-ty-dbg-error-level)" },
		"error-text": { value: "var(--color-ty-dbg-error-text)" },
		"error-bg": { value: "var(--color-ty-dbg-error-bg)" },
	},
	/* Workspace tokens */
	ws: {
		"placement-surface": { value: "var(--ty-ws-placement-surface)" },
		"gridcell-ring-border": { value: "var(--color-ty-ws-gridcell-ring-border)" },
		"gridcell-ring-border-selected": {
			value: "var(--color-ty-ws-gridcell-ring-border-selected)",
		},
		"selrect-border": { value: "var(--color-ty-ws-selrect-border)" },
		"selrect-fill": { value: "var(--color-ty-ws-selrect-fill)" },
	},
	/* Shell (settings / cep-shell) tokens */
	shell: {
		"canvas-start": { value: "var(--color-ty-shell-canvas-start)" },
		"canvas-end": { value: "var(--color-ty-shell-canvas-end)" },
		panel: { value: "var(--color-ty-shell-panel)" },
		"panel-strong": { value: "var(--color-ty-shell-panel-strong)" },
		border: { value: "var(--color-ty-shell-border)" },
		text: { value: "var(--color-ty-shell-text)" },
		muted: { value: "var(--color-ty-shell-muted)" },
		warm: { value: "var(--color-ty-shell-warm)" },
		success: { value: "var(--color-ty-shell-success)" },
		"body-accent-top": { value: "var(--color-ty-body-accent-top)" },
		"body-accent-bottom": { value: "var(--color-ty-body-accent-bottom)" },
		monaco: { value: "var(--color-ty-shell-monaco-bg)" },
	},
});

const opacities = defineTokens.opacities({
	"text-main": { value: "var(--ty-opacity-text-main)" },
	"text-muted": { value: "var(--ty-opacity-text-muted)" },
	"action-primary": { value: "var(--ty-opacity-action-primary)" },
	"border-default": { value: "var(--ty-opacity-border-default)" },
	"ws-scrollbar-hover": { value: "var(--ty-opacity-ws-scrollbar-hover)" },
	"ws-scrollbar-thumb": { value: "var(--ty-opacity-ws-scrollbar-thumb)" },
	"ws-scrollbar-thumb-strong": {
		value: "var(--ty-opacity-ws-scrollbar-thumb-strong)",
	},
	"ws-accent-outline": { value: "var(--ty-opacity-ws-accent-outline)" },
	"ws-widget-drag": { value: "var(--ty-opacity-ws-widget-drag)" },
	"ws-gridcell-ring-border": { value: "var(--ty-opacity-ws-gridcell-ring-border)" },
	"ws-gridcell-ring-border-selected": {
		value: "var(--ty-opacity-ws-gridcell-ring-border-selected)",
	},
	"ws-selrect-border": { value: "var(--ty-opacity-ws-selrect-border)" },
	"ws-selrect-fill": { value: "var(--ty-opacity-ws-selrect-fill)" },
	"ws-drag-preview": { value: "var(--ty-opacity-ws-drag-preview)" },
});

const spacing = defineTokens.spacing({
	0: { value: "0" },
	px: { value: "1px" },
	"0.5": { value: "0.125rem" },
	"0.75": { value: "0.1875rem" },
	1: { value: "0.25rem" },
	"1.25": { value: "0.3125rem" },
	"1.5": { value: "0.375rem" },
	"1.75": { value: "0.4375rem" },
	2: { value: "0.5rem" },
	"2.25": { value: "0.5625rem" },
	"2.5": { value: "0.625rem" },
	"2.75": { value: "0.6875rem" },
	3: { value: "0.75rem" },
	"3.25": { value: "0.8125rem" },
	"3.5": { value: "0.875rem" },
	"3.75": { value: "0.9375rem" },
	4: { value: "1rem" },
	"4.5": { value: "1.125rem" },
	5: { value: "1.25rem" },
	"5.5": { value: "1.375rem" },
	6: { value: "1.5rem" },
	"6.5": { value: "1.625rem" },
	7: { value: "1.75rem" },
	"7.5": { value: "1.875rem" },
	8: { value: "2rem" },
	"8.5": { value: "2.125rem" },
	9: { value: "2.25rem" },
	"9.5": { value: "2.375rem" },
	10: { value: "2.5rem" },
	"10.5": { value: "2.625rem" },
	11: { value: "2.75rem" },
	"11.25": { value: "2.8125rem" },
	"11.5": { value: "2.875rem" },
	12: { value: "3rem" },
	"12.5": { value: "3.125rem" },
	"13.5": { value: "3.375rem" },
	"13.75": { value: "3.4375rem" },
	14: { value: "3.5rem" },
	16: { value: "4rem" },
	"17.5": { value: "4.375rem" },
	20: { value: "5rem" },
	"22.5": { value: "5.625rem" },
	24: { value: "6rem" },
	"26.25": { value: "6.5625rem" },
	28: { value: "7rem" },
	29: { value: "7.25rem" },
	30: { value: "7.5rem" },
	32: { value: "8rem" },
	"32.5": { value: "8.125rem" },
	35: { value: "8.75rem" },
	36: { value: "9rem" },
	40: { value: "10rem" },
	42: { value: "10.5rem" },
	44: { value: "11rem" },
	45: { value: "11.25rem" },
	48: { value: "12rem" },
	50: { value: "12.5rem" },
	52: { value: "13rem" },
	55: { value: "13.75rem" },
	56: { value: "14rem" },
	60: { value: "15rem" },
	64: { value: "16rem" },
	70: { value: "17.5rem" },
	72: { value: "18rem" },
	80: { value: "20rem" },
	90: { value: "22.5rem" },
	96: { value: "24rem" },
	105: { value: "26.25rem" },
	130: { value: "32.5rem" },
	180: { value: "45rem" },
	200: { value: "50rem" },
	/* Tailwind-era named spacing tokens. */
	shell: { value: "var(--ty-shell-space)" },
	"widget-gap": { value: "var(--ty-widget-gap)" },
	"ws-grid-gap": { value: "var(--ty-ws-grid-gap)" },
});

const radii = defineTokens.radii({
	shell: { value: "var(--ty-shell-radius)" },
	"shell-sm": { value: "var(--ty-shell-radius-sm)" },
	"shell-lg": { value: "var(--ty-shell-radius-lg)" },
	full: { value: "var(--ty-radius-full)" },
	"pill-md": { value: "var(--ty-radius-pill-md)" },
	"ws-grid": { value: "var(--ty-ws-grid-radius)" },
	"surface-card": { value: "var(--ty-surface-card-radius)" },
	"surface-detail": { value: "var(--ty-surface-detail-radius)" },
});

const sizes = defineTokens.sizes({
	"shell-text": { value: "var(--ty-shell-text-size)" },
	"shell-text-sm": { value: "var(--ty-shell-text-size-sm)" },
	"text-xs": { value: "var(--ty-text-size-xs)" },
	"text-2xs": { value: "var(--ty-text-size-2xs)" },
	"text-3xs": { value: "var(--ty-text-size-3xs)" },
	"text-md": { value: "var(--ty-text-size-md)" },
	"text-body": { value: "var(--ty-text-size-body)" },
	"text-display-sm": { value: "var(--ty-text-size-display-sm)" },
	"text-grid-measure": { value: "var(--ty-text-size-grid-measure)" },
	"text-prompt": { value: "var(--ty-text-size-prompt)" },
	"shell-border-width": { value: "var(--ty-shell-border-width)" },
	"widget-header-height": { value: "var(--ty-widget-header-height)" },
	"widget-gap": { value: "var(--ty-widget-gap)" },
	"ws-scrollbar-width": { value: "var(--ty-ws-scrollbar-width)" },
	"ws-grid-cell": { value: "var(--ty-ws-grid-cell)" },
	"ws-cell": { value: "var(--ty-ws-cell)" },
	"ws-grid-gap": { value: "var(--ty-ws-grid-gap)" },
	"surface-media-min-height": { value: "var(--ty-surface-media-min-height)" },
});

const fonts = defineTokens.fonts({
	base: {
		value:
			'system-ui, "Segoe UI", "Helvetica Neue", ui-sans-serif, sans-serif',
	},
});

const fontSizes = defineTokens.fontSizes({
	"shell-text": { value: "var(--ty-shell-text-size)" },
	"shell-text-sm": { value: "var(--ty-shell-text-size-sm)" },
	"text-xs": { value: "var(--ty-text-size-xs)" },
	"text-2xs": { value: "var(--ty-text-size-2xs)" },
	"text-3xs": { value: "var(--ty-text-size-3xs)" },
	"text-md": { value: "var(--ty-text-size-md)" },
	"text-body": { value: "var(--ty-text-size-body)" },
	"text-display-sm": { value: "var(--ty-text-size-display-sm)" },
	"text-grid-measure": { value: "var(--ty-text-size-grid-measure)" },
	"text-prompt": { value: "var(--ty-text-size-prompt)" },
});

const borderWidths = defineTokens.borderWidths({
	"shell-border-width": { value: "var(--ty-shell-border-width)" },
});

const shadows = defineTokens.shadows({
	"control-panel": { value: "var(--ty-shadow-control-panel)" },
	shadow: {
		"control-panel": { value: "var(--ty-shadow-control-panel)" },
	},
});

const durations = defineTokens.durations({
	shell: { value: "var(--ty-shell-duration)" },
	fast: { value: "var(--ty-transition-fast)" },
	micro: { value: "var(--ty-transition-micro)" },
	panel: { value: "var(--ty-transition-panel)" },
});

export default defineConfig({
	preflight: true,
	include: ["./src/**/*.{ts,tsx}"],
	exclude: [],
	jsxFramework: "react",
	outdir: "styled-system",

	globalCss: {
		html: {
			minWidth: "var(--ty-cep-shell-min-width, 280px)",
			minHeight: "var(--ty-cep-shell-min-height, 360px)",
			height: "100%",
			margin: 0,
			overflow: "hidden",
		},
		body: {
			minWidth: "var(--ty-cep-shell-min-width, 280px)",
			minHeight: "var(--ty-cep-shell-min-height, 360px)",
			height: "100%",
			margin: 0,
			overflow: "hidden",
		},
		"#app": {
			boxSizing: "border-box",
			display: "flex",
			flexDirection: "column",
			height: "100%",
			minHeight: 0,
			overflow: "hidden",
		},
		"*, *::before, *::after": {
			"scrollbar-width": "thin",
		},
		"::-webkit-scrollbar": {
			width: "var(--scrollbar-width, 4px)",
			height: "var(--scrollbar-width, 4px)",
		},
		"::-webkit-scrollbar-track": {
			background: "var(--scrollbar-track-bg, transparent)",
		},
		"::-webkit-scrollbar-thumb": {
			background: "var(--scrollbar-thumb-bg, var(--ty-text-muted))",
			borderRadius: "var(--scrollbar-thumb-radius, 2px)",
			visibility: "hidden",
			transition:
				"visibility 0ms linear var(--scrollbar-transition-duration, 150ms)",
		},
		"::-webkit-scrollbar-corner": {
			background: "var(--scrollbar-track-bg, transparent)",
		},
		"*:hover::-webkit-scrollbar-thumb": {
			visibility: "visible",
			"transition-delay": "0ms",
		},
	},

	theme: {
		extend: {
			tokens: {
				colors,
				opacity: opacities,
				spacing,
				radii,
				sizes,
				fonts,
				fontSizes,
				borderWidths,
				shadows,
				durations,
			},
			breakpoints: {
				sm: "0rem",
				md: "0rem",
				lg: "0rem",
				xl: "0rem",
				"2xl": "0rem",
			},
		},
	},
});
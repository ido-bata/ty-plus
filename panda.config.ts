/**
 * PandaCSS config — CEP panel / shared-package build.
 *
 * Token values come from `panda.tokens.ts` (shared with the official web
 * build at `apps/web/panda.config.ts`). The CEP panel is a fixed-size
 * surface: responsive breakpoints are pinned to 0rem so breakpoint
 * conditions can never emit media queries inside the panel. Web layout
 * conditions live exclusively in the web config — do not use
 * `base:`/`sm:`/`md:`/`lg:`/`xl:`/`2xl:` responsive keys in `src/` or
 * `packages/` (enforced by scripts/check/check-web-design.ts).
 */
import { defineConfig } from "@pandacss/dev";
import {
	borderWidths,
	colors,
	durations,
	fontSizes,
	fonts,
	opacities,
	radii,
	shadows,
	sizes,
	spacing,
} from "./panda.tokens";

export default defineConfig({
	preflight: true,
	include: ["./src/**/*.{ts,tsx}", "./packages/**/*.{ts,tsx}"],
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

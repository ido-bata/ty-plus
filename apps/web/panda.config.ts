/**
 * PandaCSS config — official web build (`apps/web`).
 *
 * Shares token *values* with the CEP build via `../../panda.tokens.ts`
 * (both resolve to the same `--ty-*` custom properties). What is NOT
 * shared: breakpoints and globalCss. The web is a normal responsive
 * document, so real breakpoints live here; the CEP panel pins them to
 * 0rem in the root `panda.config.ts`.
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
} from "../../panda.tokens";

export default defineConfig({
	preflight: true,
	include: ["./src/**/*.{ts,tsx}", "../../packages/ui/src/**/*.{ts,tsx}"],
	exclude: [],
	jsxFramework: "react",
	outdir: "styled-system",

	globalCss: {
		"*": {
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
				sm: "40rem",
				md: "48rem",
				lg: "64rem",
				xl: "80rem",
				"2xl": "96rem",
			},
		},
	},
});

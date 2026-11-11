import { readFileSync } from "node:fs";
import path from "node:path";

import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";

/**
 * Vitest config for the ty-plus project.
 *
 * Two projects coexist here:
 *
 * 1. `unit` (the root test block below) — Node-environment tests over the
 *    *.test.ts(x) surface. These run under `bun run test` and gate PRs.
 *
 * 2. `storybook` (inside `test.projects`) — browser-environment tests that
 *    render stories under headless Chromium. This is the official path
 *    for headless story validation, replacing the manual
 *    `scripts/verify/sb-snapshot-all.ts` workaround. The storybookTest
 *    plugin pulls in everything Storybook needs (story glob, aliases,
 *    decorators, CEP-plugin stripping) through `.storybook/main.ts →
 *    viteFinal`, so this project deliberately does NOT use
 *    `extends: true` — the root `setupFiles` points at `./vitest.setup.ts`
 *    which dereferences `process.stderr` at import time and crashes
 *    under the Vitest browser project.
 *
 * The Storybook project goes through `.storybook/main.ts -> viteFinal` which
 * already strips CEP plugins (vite-cep-plugin, extenderscript resolvers,
 * dev-redirect strippers, etc.). Importing vite.config.ts directly here
 * would inject those plugins into the browser test path and either crash
 * at boot or silently corrupt CEP artifacts — see the long comment block
 * at the top of .storybook/main.ts for the full blacklist.
 */
export default defineConfig({
	// The panel reads its own version through __APP_VERSION__ (sourced from
	// package.json in vite.config.ts). Vitest does not inherit vite's `define`,
	// so re-declare it here for the same value.
	define: {
		__APP_VERSION__: JSON.stringify(
			JSON.parse(readFileSync("package.json", "utf8")).version,
		),
	},
	resolve: {
		alias: [
			{
				find: /^@\/(?!styled-system)/,
				replacement: path.resolve(__dirname, "src") + "/",
			},
			{
				find: "@/styled-system",
				replacement: path.resolve(__dirname, "styled-system"),
			},
		],
	},
	test: {
		environment: "node",
		environmentOptions: {
			jsdom: {
				html: "<!doctype html><html><body></body></html>",
				url: "http://localhost/",
			},
		},
		setupFiles: ["./vitest.setup.ts"],
		include: [
			"src/**/*.test.ts",
			"src/**/*.test.tsx",
			"tools/**/*.test.ts",
			"scripts/**/*.test.ts",
		],
		exclude: [
			"node_modules",
			"dist",
			"coverage",
			"archive/**",
			"docs/**",
			"**/archive/**",
			"**/docs/**",
		],
		testTimeout: 5000,
		hookTimeout: 5000,
		isolate: true,
		clearMocks: true,
		reporters: process.env.CI ? ["default", "json"] : ["default"],
		pool: "forks",
		maxWorkers: 1,
		coverage: {
			provider: "v8",
			enabled: !!process.env.COVERAGE,
			reporter: ["text", "json", "html", "lcov"],
			// PR 3 narrows the coverage include to the **new code** this
			// change set introduces. Files merely touched (Center.tsx,
			// boot.tsx) keep most of their pre-existing untested surface;
			// expanding the gate to those is a follow-up coverage-uplift PR,
			// not part of this feature PR.
			//
			// `perFile: true` so each included file is judged independently —
			// one file at 100% no longer masks another at 0%, and legacy
			// untested files kept out of the include list do not impact the
			// gate at all.
			include: [
				"src/management/online/catalog/composition-runtime-dispatcher.ts",
				"src/management/panel/cloud-gateway-boot.ts",
			],
			perFile: true,
			exclude: [
				"node_modules/**",
				"dist/**",
				"coverage/**",
				"docs/**",
				"archive/**",
				"reference/**",
				"**/archive/**",
				"**/reference/**",
				"**/*.test.ts",
				"**/*.test.tsx",
				"**/*.d.ts",
				"src/jsx/**",
				"src/js/lib/cep/**",
			],
			thresholds: {
				lines: 80,
				statements: 80,
				functions: 80,
				branches: 80,
			},
		},
		projects: [
			{
				// The root `test` block above IS the unit project — but
				// Vitest does not run the root block once `projects` is
				// defined, so it has to be re-declared as a project. Without
				// this entry `bun run test` silently collects only the
				// Storybook stories (0 unit tests) and no unit test gates the
				// PR. `extends: true` is what pulls in the root `include`,
				// `setupFiles`, aliases and pool settings.
				extends: true,
				test: {
					name: "unit",
				},
			},
			{
				// No `extends: true` here — the root `setupFiles`
				// points at `./vitest.setup.ts` which dereferences
				// `process.stderr` at import time and crashes under
				// the Vitest browser project. The storybookTest
				// plugin pulls in everything we need (story glob,
				// aliases, decorators, CEP-plugin stripping) through
				// `.storybook/main.ts → viteFinal`, so we don't lose
				// anything by isolating this project.
				// `define` is re-declared because this project builds its
				// vite config through the addon's viteFinal and does not
				// inherit the root define (same value as the root block).
				define: {
					__APP_VERSION__: JSON.stringify(
						JSON.parse(readFileSync("package.json", "utf8")).version,
					),
				},
				plugins: [
					// storybookTest internally wires up Storybook's viteFinal
					// (the same one .storybook/main.ts uses) so CEP plugins
					// are stripped, aliases are re-applied, and the
					// @vitejs/plugin-react preamble is registered exactly
					// once. It then injects a Vitest plugin that turns each
					// story into a test by reading `storybook-static/
					// index.json` and `importFn`-ing the CSF module.
					storybookTest({
						configDir: path.resolve(__dirname, ".storybook"),
					}),
				],
				test: {
					name: "storybook",
					// Override the inherited node-environment settings.
					// The Vitest addon's plugin takes care of the browser
					// preview setup; we only need to declare the provider,
					// headless mode, and which browser to launch.
					environment: "happy-dom",
					browser: {
						enabled: true,
						provider: playwright({}),
						headless: true,
						instances: [{ browser: "chromium" }],
					},
					// Stories can pull in Monaco/WASM chains that hang
					// the test loader; the addon's setup file applies a
					// per-test timeout via the story lifecycle, but we
					// bump it here as a hard ceiling so a single hung
					// story can't block the whole A/B sweep.
					testTimeout: 30_000,
					hookTimeout: 30_000,
					// The addon's setup file wires project annotations
					// (decorators/parameters from `.storybook/preview.ts`)
					// into the per-story render. Without this the
					// decorator chain documented in `preview.ts`
					// (CepMock → CepContext → Settings → License →
					// I18n → FilesGateway → Theme → Surface) never
					// reaches the test render — same effect we see
					// in `sb-snapshot-all.ts` where stories render as
					// empty if decorators are not re-applied. The
					// second entry is the diagnostic screenshot
					// capture hook (see the file header).
					setupFiles: [
						"@storybook/addon-vitest/internal/setup-file-with-project-annotations",
						"./scripts/verify/storybook-screenshot-capture.ts",
					],
				},
			},
		],
	},
});

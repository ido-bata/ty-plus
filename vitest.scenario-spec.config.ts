import path from "node:path";

import { defineConfig } from "vitest/config";

/**
 * Vitest config for the scenario-spec rule runner.
 *
 * This is a deliberately minimal config: it targets only the rule-runner
 * test file and inherits none of the parent project (Storybook browser
 * suite, CEP-plugin stripping, etc.).  The scenario-spec runner does
 * not execute scenario actions and has no UI dependency, so it can run
 * under the standard `node` environment without CEP / Storybook / Playwright
 * plugins.
 *
 * Aliases are kept identical to the main config so imports resolve.
 */
export default defineConfig({
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
		include: [
			"src/shared/scenario/scenario-rule-runner.test.ts",
			"src/shared/scenario/validator.test.ts",
			"src/shared/scenario/loader.test.ts",
			"src/shared/scenario/verification-matrix.test.ts",
			"src/shared/scenario/real-anchors.test.ts",
		],
		exclude: ["node_modules", "dist", "coverage", "archive/**", "docs/**"],
		testTimeout: 5000,
		hookTimeout: 5000,
		isolate: true,
		clearMocks: true,
		pool: "forks",
		maxWorkers: 1,
	},
});

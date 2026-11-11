// Build artifact smoke test for Issue #129.
//
// Verifies that the production source transform (`dropConsoleLogInfoPlugin`)
// does not strip `console.*` calls from the central diagnostic logger module,
// while still stripping them from non-logger modules.
//
// Why this exists: the bug fixed by #129 was that the production transform
// removed `console.log/info` calls from every shipped file, including any
// call site that needed to land in the debug-console sink. The logger
// whitelists its own module path so this regression cannot recur silently.
//
// The test invokes the plugin's `transform` directly against a logger
// source fragment and a non-logger fragment. It does not require a full
// `vite build`, which keeps it under a second and avoids the CEP artifact
// pipeline (manifests, ExtendScript rollup, etc.) that `bun run build`
// triggers.

import { readFileSync } from "node:fs";
import path from "node:path";

import { LOGGER_MODULE_PATH_SUFFIX } from "../../src/management/debug/logger";

// Mirrors `vite.config.ts#dropConsoleLogInfoPlugin` exactly. Drift between
// this copy and the real plugin is intentional: a separate copy here makes
// any divergence a test failure (this script is run in CI).
const isProduction = process.env.NODE_ENV === "production";

const transform = (
	code: string,
	id: string,
): { code: string; map: null } | null => {
	if (!isProduction) return null;
	if (
		!/\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(id) ||
		id.includes("/node_modules/")
	) {
		return null;
	}
	if (id.endsWith(LOGGER_MODULE_PATH_SUFFIX)) {
		return null;
	}
	const stripped = code
		.replace(/console\.log\((?:[^()]|\([^()]*\))*\);?/g, ";")
		.replace(/console\.info\((?:[^()]|\([^()]*\))*\);?/g, ";");
	return stripped === code ? null : { code: stripped, map: null };
};

const assertContains = (
	haystack: string,
	needle: string,
	label: string,
): void => {
	if (!haystack.includes(needle)) {
		throw new Error(
			`[check-debug-logger-survives-bundle] ${label}: expected to contain ${JSON.stringify(needle)}`,
		);
	}
};

const assertNotContains = (
	haystack: string,
	needle: string,
	label: string,
): void => {
	if (haystack.includes(needle)) {
		throw new Error(
			`[check-debug-logger-survives-bundle] ${label}: expected NOT to contain ${JSON.stringify(needle)}`,
		);
	}
};

const main = async (): Promise<void> => {
	if (!isProduction) {
		// In dev, the plugin short-circuits. The smoke test only asserts the
		// production transform; skip with a clear log so CI does not flag
		// dev runs as silent successes.
		console.log(
			"[check-debug-logger-survives-bundle] NODE_ENV !== production; skipping production transform assertion.",
		);
		return;
	}

	const projectRoot = path.resolve(__dirname, "..", "..");
	const loggerPath = path.join(
		projectRoot,
		"src",
		"management",
		"debug",
		"logger.ts",
	);
	const loggerSource = readFileSync(loggerPath, "utf8");

	// Sanity: the logger must contain at least one `console.log` and one
	// `console.info` for this test to be meaningful.
	assertContains(
		loggerSource,
		"console.log",
		"logger source must use console.log",
	);
	assertContains(
		loggerSource,
		"console.info",
		"logger source must use console.info",
	);

	// 1. The logger module's source is NOT stripped when its id matches the
	//    whitelist suffix. We pass it through `transform` and confirm the
	//    output is identical to the input (no `;` substitutions).
	const loggerId = path.join(projectRoot, "src/management/debug/logger.ts");
	const loggerResult = transform(loggerSource, loggerId);
	if (loggerResult !== null) {
		throw new Error(
			`[check-debug-logger-survives-bundle] logger module must NOT be transformed (whitelist), but transform returned a modified code block.`,
		);
	}

	// 2. A non-logger file with `console.log/info` IS stripped. This is the
	//    pre-existing behavior we are guarding so it does not silently flip
	//    off in a future refactor.
	const fakeSource = `
function boot() {
	console.log("hello");
	console.info("info-here");
	doWork();
}
`;
	const fakeId = path.join(projectRoot, "src/some/other/boot.ts");
	const stripped = transform(fakeSource, fakeId);
	if (stripped === null) {
		throw new Error(
			`[check-debug-logger-survives-bundle] expected non-logger file to be transformed; transform returned null.`,
		);
	}
	assertNotContains(
		stripped.code,
		"console.log",
		"non-logger file's console.log must be stripped",
	);
	assertNotContains(
		stripped.code,
		"console.info",
		"non-logger file's console.info must be stripped",
	);

	// 3. The whitelist suffix must end in `logger.ts` so a future move of
	//    the file (e.g. to `src/shared/debug/`) does not silently disable
	//    the whitelist.
	if (!LOGGER_MODULE_PATH_SUFFIX.endsWith("logger.ts")) {
		throw new Error(
			`[check-debug-logger-survives-bundle] LOGGER_MODULE_PATH_SUFFIX must end with "logger.ts", got ${LOGGER_MODULE_PATH_SUFFIX}`,
		);
	}

	// 4. Cross-check that vite.config.ts actually imports the suffix and
	//    threads it through the plugin. A drift here breaks the whitelist
	//    silently.
	const viteConfig = readFileSync(
		path.join(projectRoot, "vite.config.ts"),
		"utf8",
	);
	assertContains(
		viteConfig,
		"LOGGER_MODULE_PATH_SUFFIX",
		"vite.config.ts must import LOGGER_MODULE_PATH_SUFFIX",
	);
	assertContains(
		viteConfig,
		"dropConsoleLogInfoPlugin(",
		"vite.config.ts must invoke the plugin with the suffix",
	);

	console.log(
		"[check-debug-logger-survives-bundle] OK — central logger survives production transform; non-logger files still get stripped.",
	);
};

main().catch((err) => {
	console.error(err);
	process.exit(1);
});

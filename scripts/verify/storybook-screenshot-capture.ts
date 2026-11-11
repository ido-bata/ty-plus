/**
 * Vitest setupFile that captures a `page.screenshot()` after every test
 * in the storybook browser project. Used for the visual smoke check
 * that proves the official render lifecycle produces correctly styled
 * PNGs (vs the manual `sb-snapshot-all.ts` path that bypassed the
 * decorator chain).
 *
 * Wired in via `vitest.config.ts:projects[storybook].setupFiles`. The
 * addon's `testStory` helper sets `task.meta.storyId` on each generated
 * test before the test runs, so we read it back here to name the PNG.
 *
 * Output directory is `.tmp/vitest-screenshots/` and is gitignored.
 * The script is idempotent: re-running the test suite overwrites the
 * PNGs in place.
 *
 * This is a *diagnostic* capture, not the production capture pipeline
 * the next PR will build. The 10 conditions documented in
 * `docs/architecture/ui-reconstruction/storybook.md` (font ready,
 * animation settle, deterministic viewport, etc.) are not all enforced
 * here — they are the production-PR's scope. This script exists to
 * answer the narrower question "do the official-path renders look
 * right?" with actual PNGs.
 *
 * Browser-mode API quirks observed while wiring this up:
 *
 * - `page` from `vitest/browser` is `BrowserPage` (extends
 *   `LocatorSelectors`), NOT a Playwright `Page`. There is no
 *   `page.evaluate` or `page.evaluateHandle`. Use `commands.*` for
 *   file IO that has to land on the test-runner side.
 * - `page.screenshot({ path })` ignores the supplied path in browser
 *   mode and writes to a default `__screenshots__/<test-file>/<name>.png`
 *   relative to the current test file. The on-disk file IS a real PNG,
 *   but the path isn't predictable from inside the page.
 * - `page.screenshot({ base64: true })` returns `{ path, base64 }` where
 *   `base64` is the raw PNG bytes. Combine with `commands.writeFile(path,
 *   base64, "base64")` to persist to an arbitrary path.
 * - `node:fs` is not defined in the page context; `Buffer` is not
 *   defined either. Always go through `commands.writeFile`.
 */

import { afterEach } from "vitest";
import { commands, page } from "vitest/browser";

// `node:path` is not available in the page context. We only need
// two helpers — `dirname` and `resolve` — and only on absolute POSIX
// paths, so we hand-roll small versions of each.
const dirname = (p: string): string => {
	const i = p.lastIndexOf("/");
	return i <= 0 ? "/" : p.slice(0, i);
};
const resolve = (...parts: string[]): string => {
	let out = "";
	for (const part of parts) {
		if (!part) continue;
		if (part.startsWith("/")) {
			out = part;
		} else {
			out = out.endsWith("/") ? out + part : `${out}/${part}`;
		}
	}
	// Collapse `..` segments by walking.
	const segments = out.split("/").filter((s) => s.length > 0);
	const stack: string[] = [];
	for (const seg of segments) {
		if (seg === ".") continue;
		if (seg === "..") {
			stack.pop();
			continue;
		}
		stack.push(seg);
	}
	return "/" + stack.join("/");
};

// In browser mode `import.meta.dirname` is undefined, `process` is
// undefined, and `import.meta.url` is `http:` (the page URL, not a
// file URL). The only anchor we have is the path that
// `page.screenshot()` itself writes to — by default that's
// `<test-file-dir>/__screenshots__/<TestName>-<n>.png`. From that
// we can compute the repo root by stripping `/__screenshots__/...`
// and walking up. To keep this robust against the Playwright provider
// changing its default location, we also let `result.path` come back
// from the screenshot call and just read the bytes from there rather
// than re-deriving the repo root.
//
// Output target is therefore set lazily inside `afterEach`, after we
// know where Playwright actually wrote the file. We then re-emit it
// to `.tmp/vitest-screenshots/<storyId>.png` via `commands.writeFile`
// for the reviewer to inspect.

// `task.meta.storyId` is set by the addon's `testStory` helper
// (`node_modules/@storybook/addon-vitest/dist/vitest-plugin/test-utils.js`).
// We read it back here via the `context.task` arg to `afterEach`.
afterEach(async (ctx) => {
	const task = ctx.task as { meta?: { storyId?: string } } | undefined;
	const storyId = task?.meta?.storyId;
	if (!storyId) {
		// Not a story test (e.g. some manual entrypoint that doesn't
		// go through `testStory`). Skip silently — we only want to
		// capture story renders.
		return;
	}

	// Wait for fonts to be ready so the PNG matches what a developer
	// sees in the Storybook UI. The production capture pipeline
	// should also enforce this (see docs .../storybook.md "Next PR"
	// condition 6).
	if (typeof document !== "undefined" && "fonts" in document) {
		await document.fonts.ready;
	}

	// Take a screenshot of the test page (which the addon has
	// already populated with the Storybook preview iframe + React
	// tree by the time `afterEach` fires). The wrapper returns
	// `{ path, base64 }` when `base64: true`. We use the base64
	// payload to write to our own target path via `commands.writeFile`.
	//
	// Debug: dump body state to see whether the canvasElement div
	// that `runStory` appends (lines 35226-35231 of
	// `node_modules/storybook/dist/preview/runtime.js`) is still
	// attached at the time we screenshot. If it's been removed
	// already, that explains the uniform-blank 3525-byte PNGs.
	const bodyChildCount = document.body.children.length;
	const bodyHtmlLen = document.body.innerHTML.length;
	// eslint-disable-next-line no-console
	console.log(
		`[capture] DOM ${storyId} bodyChildren=${bodyChildCount} bodyHtmlLen=${bodyHtmlLen}`,
	);

	const result = await page.screenshot({ base64: true });
	// eslint-disable-next-line no-console
	console.log(`[capture] DEBUG ${storyId} result.path=${result.path}`);

	// Derive the repo root from Playwright's own screenshot path. The
	// provider writes to `<repo>/<test-file-dir>/__screenshots__/<test-name>.png`.
	// Walking up two directories from the parent of `__screenshots__`
	// lands at the repo root.
	const defaultParent = dirname(result.path);
	const repoRoot = resolve(defaultParent, "..", "..");
	const outDir = resolve(repoRoot, ".tmp", "vitest-screenshots");
	const outPath = resolve(outDir, `${storyId}.png`);
	// eslint-disable-next-line no-console
	console.log(
		`[capture] DEBUG ${storyId} defaultParent=${defaultParent} repoRoot=${repoRoot} outPath=${outPath}`,
	);

	await commands.writeFile(outPath, result.base64, "base64");

	const byteLength = Math.floor((result.base64.length * 3) / 4);

	// The minimum realistic byte count for a 1280x720 PNG that has
	// any non-trivial content is ~8KB; below that it's effectively
	// a flat background. Log explicitly so the reviewer can spot
	// empties at a glance without opening the file.
	const minRealisticBytes = 8_000;
	const verdict = byteLength > minRealisticBytes ? "OK" : "EMPTY";
	// eslint-disable-next-line no-console
	console.log(
		`[capture] ${verdict} ${storyId} → ${outPath} (${byteLength} bytes)`,
	);
});

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
 * - `commands.writeFile` resolves its argument against the Vitest
 *   project root on the *Node* side, using the host platform's own
 *   `path.resolve`. So this file must only ever pass a path relative to
 *   that root; see `screenshot-path.ts` for the path contract.
 */

import { afterEach } from "vitest";
import { commands, page } from "vitest/browser";

import { screenshotOutputRelativePath } from "./screenshot-path";

// In browser mode `import.meta.dirname` is undefined, `process` is
// undefined, and `import.meta.url` is `http:` (the page URL, not a
// file URL). Rather than recover a filesystem root here — the page
// context has no `node:path`, and any root derived from the absolute
// path `page.screenshot()` reports is platform-shaped — the target is
// expressed relative to the Vitest project root and resolved by the
// runner. See `screenshot-path.ts`.

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

	// Relative to the project root; the runner joins it with the host
	// platform's `path.resolve`. Passing an absolute path built in this
	// context can produce `C:\C:\...` on Windows.
	const outPath = screenshotOutputRelativePath(storyId);
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

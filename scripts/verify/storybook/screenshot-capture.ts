/**
 * Vitest setupFile that captures a `page.screenshot()` plus a JSON
 * metadata sidecar after every story test in the storybook browser
 * project. This is the production capture path described in
 * `docs/architecture/ui-reconstruction/storybook.md` ("Next PR —
 * capture mechanism requirements"): it runs on top of the official
 * `@storybook/addon-vitest` lifecycle, so decorators, loaders and
 * `play()` all complete before the shutter fires.
 *
 * Wired in via `vitest.config.ts:projects[storybook].setupFiles`, after
 * `@storybook/addon-vitest/internal/setup-file-with-project-annotations`.
 * The addon's `testStory` helper sets `task.meta.storyId` on each
 * generated test before the test runs, so we read it back here to name
 * the outputs.
 *
 * Outputs (both gitignored, shard-safe because storyIds are unique per
 * shard):
 *
 * - PNG:      `.tmp/vitest-screenshots/<storyId>.png`
 * - metadata: `.tmp/storybook-captures/<storyId>.json`
 *
 * Requirement coverage (same numbering as the doc):
 *
 *  1. Every story the addon enumerates gets a capture — the hook is
 *     `afterEach`-driven, not a hand-picked list. The merge step
 *     (`storybook-capture-merge.ts`) diffs the sidecars against
 *     `storybook-static/index.json` for machine-checkable coverage.
 *  2. `console.error`, `window.error` and `unhandledrejection` are
 *     collected per story into the sidecar's `consoleErrors`/`pageErrors`.
 *  3. `afterEach` fires only after the addon has awaited the story's
 *     render + `play()`; we additionally settle fonts and one frame.
 *  4. The viewport is pinned to {@link CAPTURE_VIEWPORT} three ways:
 *     `parameters.viewport.defaultViewport` in `.storybook/preview.ts`
 *     (so the addon's per-story `setViewport` picks our size),
 *     `page.viewport()` in `beforeEach`, and a re-pin in `afterEach`
 *     after the story lifecycle; the provider context viewport in
 *     `vitest.config.ts` keeps the window large enough to avoid clip.
 *     The measured size is recorded in the sidecar.
 *  5. A global `animation/transition: none` stylesheet is injected so
 *     the same story produces stable pixels across runs.
 *  6. `document.fonts.ready` is awaited before the screenshot.
 *  7. Render failure vs capture failure is distinguished by `status`:
 *     the test's own failure flips `render-failed`; a `page.screenshot()`
 *     throw flips `capture-error`. Capture errors are logged as
 *     `[capture-failure]` and recorded in metadata but NOT rethrown —
 *     a single flaky frame must not fail a 474-test shard; the merge
 *     step surfaces `capture-error` entries as a separate bucket.
 *  8. Per-story JSON sidecars carry the full metadata record.
 *  9. Sidecar/PNG names derive only from `storyId`, so `--shard`
 *     splits write disjoint files; ordering is the runner's, not ours.
 * 10. `storybook-capture-gallery.ts` reads the sidecars, never PNG
 *     byte sizes.
 *
 * Browser-mode API quirks (unchanged from the diagnostic version):
 *
 * - `page` from `vitest/browser` is `BrowserPage`, not a Playwright
 *   `Page`: no `evaluate`, but `page.viewport()` and
 *   `page.screenshot({ base64: true })` exist.
 * - `page.screenshot({ base64: true })` returns `{ path, base64 }`;
 *   `base64` is persisted via `commands.writeFile(path, base64,
 *   "base64")` which resolves relative to the project root on the Node
 *   side and creates parent directories.
 * - `node:fs`/`Buffer` do not exist in the page context; all file IO
 *   goes through `commands.*`.
 */

import { afterEach, beforeEach, onTestFailed } from "vitest";
import { commands, page, userEvent } from "vitest/browser";

import {
	CAPTURE_METADATA_VERSION,
	type StorybookCaptureMetadata,
} from "./capture-metadata";
import {
	captureMetadataRelativePath,
	screenshotOutputRelativePath,
} from "./screenshot-path";

/** Pinned capture viewport (req 4). Keep in sync with the provider
 * `contextOptions.viewport` in `vitest.config.ts`. */
export const CAPTURE_VIEWPORT = { width: 1280, height: 720 } as const;

const MOTION_KILL_STYLE_ID = "ty-plus-capture-motion-kill";
const POINTER_PARKER_ID = "ty-plus-capture-pointer-parker";
const MAX_COLLECTED_ERRORS = 100;

// ── Per-story error collectors (req 2) ──────────────────────────────────
//
// The setup module is evaluated once per test-file iframe, so module
// scope is the right lifetime for the wrappers: they must survive across
// the tests of one file but not leak into the next file's fresh iframe.
// The collected arrays live on `globalThis` so a re-evaluated module
// (HMR edge cases) reuses the same sink instead of double-wrapping
// `console.error`.

type CaptureErrorLog = {
	consoleErrors: string[];
	pageErrors: string[];
};

const CAPTURE_LOG_KEY = "__tyPlusStorybookCaptureLog";

const captureLog = (): CaptureErrorLog => {
	const g = globalThis as { [CAPTURE_LOG_KEY]?: CaptureErrorLog };
	if (!g[CAPTURE_LOG_KEY]) {
		g[CAPTURE_LOG_KEY] = { consoleErrors: [], pageErrors: [] };
	}
	return g[CAPTURE_LOG_KEY];
};

const formatConsoleArg = (arg: unknown): string => {
	if (typeof arg === "string") return arg;
	if (arg instanceof Error) return arg.stack ?? arg.message;
	try {
		return JSON.stringify(arg) ?? String(arg);
	} catch {
		return String(arg);
	}
};

const pushCapped = (list: string[], entry: string): void => {
	if (list.length < MAX_COLLECTED_ERRORS) list.push(entry);
};

const installErrorCollectors = (): void => {
	const log = captureLog() as CaptureErrorLog & { installed?: boolean };
	if (log.installed) return;
	log.installed = true;

	const originalConsoleError = console.error.bind(console);
	console.error = (...args: unknown[]): void => {
		pushCapped(log.consoleErrors, args.map(formatConsoleArg).join(" "));
		originalConsoleError(...args);
	};

	window.addEventListener("error", (event) => {
		const where =
			event.filename || event.lineno
				? ` (${event.filename}:${event.lineno}:${event.colno})`
				: "";
		pushCapped(log.pageErrors, `${event.message || "Unknown error"}${where}`);
	});
	window.addEventListener("unhandledrejection", (event) => {
		const reason: unknown = event.reason;
		const text =
			reason instanceof Error
				? (reason.stack ?? reason.message)
				: formatConsoleArg(reason);
		pushCapped(log.pageErrors, `Unhandled rejection: ${text}`);
	});
};

// ── Motion kill + pointer parking (req 5, cross-story hygiene) ──────────

const MOTION_KILL_CSS = `*,*::before,*::after{animation:none!important;transition:none!important;}`;

const ensureMotionKill = (): void => {
	let style = document.getElementById(MOTION_KILL_STYLE_ID);
	if (!style) {
		style = document.createElement("style");
		style.id = MOTION_KILL_STYLE_ID;
		(document.head ?? document.documentElement).appendChild(style);
	}
	if (style.textContent !== MOTION_KILL_CSS) {
		style.textContent = MOTION_KILL_CSS;
	}
};

/**
 * Real-pointer state leaks across stories: `userEvent.hover` in one
 * story's `play()` leaves the cursor over that element, and the next
 * story's resting screenshot would capture a `:hover` style it never
 * asked for (the spacer hack in `DirectoryBrowserIconCard.stories.tsx`
 * exists because of this). Parking the pointer on an invisible fixed
 * corner element in `beforeEach` gives every story the same neutral
 * pointer position. Failures are warnings, not errors — a missed park
 * degrades determinism but must not fail the suite.
 */
const parkPointer = async (): Promise<void> => {
	let parker = document.getElementById(POINTER_PARKER_ID);
	if (!parker) {
		parker = document.createElement("div");
		parker.id = POINTER_PARKER_ID;
		parker.style.cssText =
			"position:fixed;top:0;left:0;width:4px;height:4px;z-index:2147483647;";
		document.body.appendChild(parker);
	}
	try {
		await userEvent.hover(parker);
	} catch (error) {
		// eslint-disable-next-line no-console
		console.warn(
			`[capture] pointer park failed: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
};

// ── PNG helpers ─────────────────────────────────────────────────────────

/** Exact decoded byte length of a base64 payload. */
const base64ByteLength = (base64: string): number => {
	const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
	return Math.floor(base64.length / 4) * 3 - padding;
};

/**
 * Reads width/height out of the PNG IHDR without decoding the whole
 * image: the first 44 base64 chars cover the 8-byte signature, the
 * IHDR length/type, and the two big-endian uint32 dimensions.
 */
const pngDimensions = (
	base64: string,
): { width: number; height: number } | null => {
	try {
		const head = atob(base64.slice(0, 44));
		const bytes = new Uint8Array(head.length);
		for (let i = 0; i < head.length; i += 1) {
			bytes[i] = head.charCodeAt(i);
		}
		// Signature check: 89 50 4E 47 0D 0A 1A 0A
		if (bytes[0] !== 0x89 || bytes[1] !== 0x50) return null;
		const view = new DataView(bytes.buffer);
		return { width: view.getUint32(16), height: view.getUint32(20) };
	} catch {
		return null;
	}
};

const settle = async (): Promise<void> => {
	if (typeof document !== "undefined" && "fonts" in document) {
		await document.fonts.ready;
	}
	// One frame + a macrotask so style/layout from the final paint cycle
	// (and any rAF-driven one-shot updates play() scheduled) land before
	// the screenshot.
	await new Promise<void>((resolve) => {
		requestAnimationFrame(() => resolve());
	});
	await new Promise<void>((resolve) => {
		setTimeout(resolve, 0);
	});
};

installErrorCollectors();

let renderStart = 0;
let testFailed = false;

beforeEach(async () => {
	renderStart = performance.now();
	testFailed = false;
	onTestFailed(() => {
		testFailed = true;
	});
	const log = captureLog();
	log.consoleErrors.length = 0;
	log.pageErrors.length = 0;

	// Req 4: pin the iframe viewport. The provider context viewport in
	// vitest.config.ts keeps the browser window at least this large so
	// the iframe screenshot is never clipped.
	await page.viewport(CAPTURE_VIEWPORT.width, CAPTURE_VIEWPORT.height);

	ensureMotionKill();
	await parkPointer();
});

afterEach(async (ctx) => {
	const task = ctx.task as
		| {
				meta?: { storyId?: string; title?: string };
				name?: string;
		  }
		| undefined;
	const storyId = task?.meta?.storyId;
	if (!storyId) {
		// Not a story test — nothing to name the outputs after.
		return;
	}

	const renderMs = performance.now() - renderStart;
	const captureStart = performance.now();
	// Snapshot the error arrays now — before settle/screenshot — so the
	// `[capture-failure]` lines this hook itself emits cannot leak into
	// the story's own `consoleErrors`.
	const log = captureLog();
	const consoleErrors = [...log.consoleErrors];
	const pageErrors = [...log.pageErrors];

	// Req 4 re-pin: the addon calls `page.viewport()` inside the test from
	// the story's `parameters.viewport` (our preview.ts default is the
	// pinned "capture" size, but a story-level override would win). The
	// capture viewport is a pipeline invariant, so re-assert it here —
	// after the story's own lifecycle, before the screenshot.
	let captureError: string | undefined;
	try {
		await page.viewport(CAPTURE_VIEWPORT.width, CAPTURE_VIEWPORT.height);
	} catch (error) {
		captureError = `viewport re-pin failed: ${error instanceof Error ? error.message : String(error)}`;
		// eslint-disable-next-line no-console
		console.error(`[capture-failure] ${storyId}: ${captureError}`);
	}

	await settle();

	let pngBase64: string | null = null;
	let pngPersisted = false;
	try {
		const result = await page.screenshot({ base64: true });
		pngBase64 = result.base64;
	} catch (error) {
		captureError = error instanceof Error ? error.message : String(error);
		// eslint-disable-next-line no-console
		console.error(`[capture-failure] ${storyId}: ${captureError}`);
	}

	const pngPath = screenshotOutputRelativePath(storyId);
	const metadataPath = captureMetadataRelativePath(storyId);

	let width: number | null = null;
	let height: number | null = null;
	let byteLength: number | null = null;
	if (pngBase64 !== null) {
		const dims = pngDimensions(pngBase64);
		width = dims?.width ?? null;
		height = dims?.height ?? null;
		byteLength = base64ByteLength(pngBase64);
		try {
			await commands.writeFile(pngPath, pngBase64, "base64");
			pngPersisted = true;
		} catch (error) {
			// The screenshot succeeded but persisting it failed — still a
			// capture-mechanism failure, and the sidecar must say so.
			const message = error instanceof Error ? error.message : String(error);
			captureError = captureError
				? `${captureError}; writeFile failed: ${message}`
				: `writeFile failed: ${message}`;
			// eslint-disable-next-line no-console
			console.error(`[capture-failure] ${storyId}: ${captureError}`);
		}
	}

	// `ok` requires a persisted PNG AND a clean capture path — a failed
	// viewport re-pin or write produces `capture-error` even when a PNG
	// exists, because the pixels were taken under non-pinned conditions.
	const status: StorybookCaptureMetadata["status"] = testFailed
		? "render-failed"
		: pngPersisted && captureError === undefined
			? "ok"
			: "capture-error";

	const metadata: StorybookCaptureMetadata = {
		version: CAPTURE_METADATA_VERSION,
		storyId,
		title: task?.meta?.title ?? "",
		name: task?.name ?? "",
		pngPath: pngPersisted ? pngPath : null,
		width,
		height,
		byteLength,
		consoleErrors,
		pageErrors,
		renderMs,
		captureMs: performance.now() - captureStart,
		viewport: {
			width: document.documentElement.clientWidth,
			height: document.documentElement.clientHeight,
		},
		capturedAt: new Date().toISOString(),
		status,
		...(captureError !== undefined ? { captureError } : {}),
	};

	try {
		await commands.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
	} catch (error) {
		// Losing the sidecar is worse than losing the verdict line — the
		// merge step would report this story as missing-metadata, which is
		// still a visible, correct failure bucket.
		// eslint-disable-next-line no-console
		console.error(
			`[capture-failure] ${storyId}: metadata write failed: ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	// eslint-disable-next-line no-console
	console.log(
		`[capture] ${status} ${storyId} → ${metadataPath}` +
			(pngPersisted ? ` (${byteLength} bytes)` : ""),
	);
});

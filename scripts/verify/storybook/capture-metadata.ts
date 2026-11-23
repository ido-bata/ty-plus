/**
 * Shared schema for the Storybook screenshot-capture pipeline.
 *
 * The browser-side capture hook (`storybook-screenshot-capture.ts`) writes
 * one JSON sidecar per story into `.tmp/storybook-captures/`; the Node-side
 * merge script (`storybook-capture-merge.ts`) and gallery
 * (`storybook-capture-gallery.ts`) consume them. This module is the single
 * place that defines the shape so the three sides cannot drift.
 *
 * Status semantics (docs/architecture/ui-reconstruction/storybook.md,
 * "Next PR — capture mechanism requirements" #7):
 *
 * - `ok` — the story rendered and `page.screenshot()` produced a PNG.
 * - `render-failed` — the Vitest test itself failed (assertion, play()
 *   error, render throw). A PNG may still exist as a post-mortem capture.
 * - `capture-error` — the test passed but `page.screenshot()` or the PNG
 *   write failed. This is a capture-mechanism bug, not a story bug, and
 *   must stay distinguishable in CI output.
 */

export const CAPTURE_METADATA_VERSION = 1;

type CaptureStatus = "ok" | "render-failed" | "capture-error";

type CaptureViewport = {
	width: number;
	height: number;
};

export type StorybookCaptureMetadata = {
	version: typeof CAPTURE_METADATA_VERSION;
	storyId: string;
	/** Storybook `meta.title` when the addon exposes it, else "". */
	title: string;
	/** Export name of the story when knowable, else "". */
	name: string;
	/**
	 * Project-root-relative POSIX path of the PNG
	 * (`.tmp/vitest-screenshots/<story>.png`), or `null` when the
	 * screenshot itself failed.
	 */
	pngPath: string | null;
	width: number | null;
	height: number | null;
	byteLength: number | null;
	consoleErrors: string[];
	pageErrors: string[];
	/** Wall time of mount + decorators + play(), measured in-page. */
	renderMs: number;
	/** Wall time of fonts.ready + settle + screenshot + file writes. */
	captureMs: number;
	viewport: CaptureViewport;
	capturedAt: string;
	status: CaptureStatus;
	/** Present only when `page.screenshot()` / PNG write threw. */
	captureError?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null;

const isNullableNumber = (value: unknown): boolean =>
	value === null || typeof value === "number";

const isStringArray = (value: unknown): boolean =>
	Array.isArray(value) && value.every((v) => typeof v === "string");

/**
 * Structural check for a parsed sidecar. Deliberately shallow — the merge
 * step's job is coverage classification, not schema policing; a malformed
 * file lands in `invalid` and is reported, not silently dropped.
 */
export const isCaptureMetadata = (
	value: unknown,
): value is StorybookCaptureMetadata => {
	if (!isRecord(value)) return false;
	return (
		value.version === CAPTURE_METADATA_VERSION &&
		typeof value.storyId === "string" &&
		typeof value.title === "string" &&
		typeof value.name === "string" &&
		(value.pngPath === null || typeof value.pngPath === "string") &&
		isNullableNumber(value.width) &&
		isNullableNumber(value.height) &&
		isNullableNumber(value.byteLength) &&
		isStringArray(value.consoleErrors) &&
		isStringArray(value.pageErrors) &&
		typeof value.renderMs === "number" &&
		typeof value.captureMs === "number" &&
		isRecord(value.viewport) &&
		typeof value.viewport.width === "number" &&
		typeof value.viewport.height === "number" &&
		typeof value.capturedAt === "string" &&
		(value.status === "ok" ||
			value.status === "render-failed" ||
			value.status === "capture-error")
	);
};

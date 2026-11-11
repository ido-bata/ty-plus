/**
 * Pure helpers that translate a download progress event into the values the
 * UI needs to render a progress ring around the download icon button.
 *
 * Kept in their own module (no React / lucide imports) so they can be unit
 * tested without booting the dialog tree, and reused by the gallery / card /
 * list views without duplicating the stage-to-percent mapping.
 */

import type { DownloadProgress } from "./use-cases";

type DownloadStage = DownloadProgress["stage"];

const STAGE_LABELS = {
	fetch: "Fetching metadata",
	download: "Downloading",
	write: "Saving to disk",
	icon: "Fetching icon",
	register: "Registering preset",
} as const satisfies Record<DownloadStage, string>;

/**
 * Per-stage sub-ranges of the 0–100% ring fill. Each stage owns a slice of
 * the bar so the progress display reflects the time each stage actually
 * takes. Weights are time-based for a typical preset install:
 *
 *   fetch     (gateway call)              ≈ 0.2s  →  5%
 *   download  (preset body, 50–500KB)     ≈ 2–4s  → 65%
 *   write     (writeBytesToFile)          ≈ 0.2s  →  5%
 *   icon      (thumbnail, ~50KB)          ≈ 0.5–1s→ 20%
 *   register  (local upsert)              ≈ 0.2s  →  5%
 *
 * Stages without byte-level progress (`fetch`, `write`, `register`) jump
 * straight to the end of their slice on a single event. Stages with bytes
 * (`download`, `icon`) interpolate within their slice from the running
 * max of bytes seen in that stage.
 *
 * Why not a single 0–100% bar driven by cumulative bytes? Because the
 * icon payload is much smaller than the preset body — once the download
 * ends the cumulative max never grows again, so the fill plateaus at
 * ~95% and only briefly hits 100% at the very end. The user perceives
 * that as "1% remaining but it takes a minute" — the time-consuming
 * icon / register work is hidden behind a stalled bar.
 */
const STAGE_RANGES = {
	fetch: { start: 0, end: 5 },
	download: { start: 5, end: 70 },
	write: { start: 70, end: 75 },
	icon: { start: 75, end: 95 },
	register: { start: 95, end: 100 },
} as const satisfies Record<DownloadStage, { start: number; end: number }>;

// Floor for the running estimate used when the response has no
// `Content-Length` header. Sized so typical preset payloads (50KB–
// 200KB JSX files) still reach a high percent — without this floor a
// 50KB file would map to 25% (50K/200K) and the ring would visibly
// stall well short of "full". The lookahead below makes the estimate
// always lead the loaded by LOOKAHEAD so the ratio stays below 1 and
// the ring grows continuously as bytes arrive.
const MIN_ESTIMATE = 60_000; // 60 KB
const LOOKAHEAD = 10_000; // 10 KB

/**
 * Resolve the ring fill (0-100) from the latest progress event.
 *
 * The fill is the current stage's sub-range interpolated by byte-level
 * progress within that stage. The Dialog is expected to pass the running
 * max of bytes for the CURRENT stage only (reset on stage change), so
 * the fill never regresses across stage boundaries.
 *
 *   - When the real `Content-Length` is known, the per-stage fill is the
 *     precise `bytesLoaded / bytesTotal` ratio mapped onto the slice.
 *   - Otherwise (signed Supabase / S3 URLs) we fall back to a running
 *     estimate that leads the loaded by LOOKAHEAD. The fill grows
 *     smoothly as bytes arrive and asymptotically approaches the end
 *     of the slice for large files.
 *   - For stages that don't carry bytes (`fetch`, `write`, `register`)
 *     the fill jumps straight to the end of the slice — these are
 *     sub-second single-event stages.
 *   - When no bytes have arrived yet for a byte-aware stage, the fill
 *     sits at the start of that stage's slice.
 */
export function stageToProgress(
	stage: DownloadStage,
	bytesLoaded?: number,
	bytesTotal?: number,
): number {
	const range = STAGE_RANGES[stage];

	// Stages without bytes tracking jump to the end of their slice.
	if (bytesLoaded === undefined) {
		return range.end;
	}

	let ratio: number;
	if (bytesTotal !== undefined && bytesTotal > 0) {
		ratio = Math.min(1, Math.max(0, bytesLoaded / bytesTotal));
	} else if (bytesLoaded > 0) {
		const estimate = Math.max(MIN_ESTIMATE, bytesLoaded + LOOKAHEAD);
		ratio = Math.min(1, Math.max(0, bytesLoaded / estimate));
	} else {
		return range.start;
	}

	return Math.round(range.start + (range.end - range.start) * ratio);
}

/**
 * Build the button's `title` (tooltip) text from the current stage + ring %.
 * Stages are uppercased to read as proper labels next to the percent number.
 */
export function formatStageLabel(
	stage: DownloadStage,
	percent: number,
): string {
	return `${STAGE_LABELS[stage]}… ${Math.max(0, Math.min(100, Math.round(percent)))}%`;
}

/**
 * Stroke-dashoffset for a circular progress ring at the given fill ratio.
 * The full circle would have offset 0; an empty circle would have offset =
 * circumference. The UI renders two stacked circles: a faint track + a
 * bright progress arc whose dash-offset we compute here.
 */
export function ringDashOffset(percent: number, radius: number): number {
	const circumference = 2 * Math.PI * radius;
	const ratio = Math.max(0, Math.min(1, percent / 100));
	return circumference * (1 - ratio);
}

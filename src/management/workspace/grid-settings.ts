import type { GridSettings } from "@/management/workspace/layout/grid-document";

/**
 * `settings/app.json` → `workspace.grid` extraction for the workspace
 * runtime (Issue #95). The settings dialog persists grid metrics under
 * `workspace.grid`; the layout engine consumes `state.grid`. This module is
 * the single place that translates the persisted shape into `GridSettings`.
 */

const toNonNegativeInt = (value: unknown): number | null => {
	const n = typeof value === "string" ? Number(value) : value;
	if (typeof n !== "number" || !Number.isFinite(n)) {
		return null;
	}
	const rounded = Math.round(n);
	return rounded >= 0 ? rounded : null;
};

/**
 * Reads `workspace.grid` out of a raw `settings/app.json` document.
 * Returns `null` when the section is absent or unusable so callers keep
 * their current grid instead of resetting to defaults on a partial file.
 */
export const gridSettingsFromSettingsJson = (
	settingsJson: string | null | undefined,
): GridSettings | null => {
	if (!settingsJson?.trim()) {
		return null;
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(settingsJson);
	} catch {
		return null;
	}
	if (!parsed || typeof parsed !== "object") {
		return null;
	}
	const workspace = (parsed as Record<string, unknown>).workspace;
	if (!workspace || typeof workspace !== "object") {
		return null;
	}
	const grid = (workspace as Record<string, unknown>).grid;
	if (!grid || typeof grid !== "object") {
		return null;
	}
	const record = grid as Record<string, unknown>;
	// cellSize must be positive; gap/radius legitimately allow 0.
	const cellSize = toNonNegativeInt(record.cellSize);
	const gap = toNonNegativeInt(record.gap);
	const radius = toNonNegativeInt(record.radius);
	if (cellSize === null || cellSize <= 0 || gap === null || radius === null) {
		return null;
	}
	return { cellSize, gap, radius };
};

/** Theme token keys carrying grid metrics inside a `themeLive` payload. */
export const GRID_LIVE_TOKEN_KEYS = {
	cellSize: "ty-ws-cell",
	gap: "ty-ws-grid-gap",
	radius: "ty-ws-grid-radius",
} as const;

const parsePxValue = (raw: unknown): number | null => {
	if (typeof raw !== "string") {
		return null;
	}
	const trimmed = raw.trim();
	const pxMatch = trimmed.match(/^(\d+(?:\.\d+)?)px$/i);
	if (pxMatch) {
		return Math.round(Number(pxMatch[1]));
	}
	const n = Number(trimmed);
	if (!Number.isFinite(n)) {
		return null;
	}
	return Math.round(n);
};

/**
 * Extracts `GridSettings` from a `themeLive` overrides record. Returns
 * `null` unless all three grid tokens are present — partial payloads must
 * not reset the other metrics.
 */
export const gridSettingsFromThemeOverrides = (
	overrides: unknown,
): GridSettings | null => {
	if (!overrides || typeof overrides !== "object") {
		return null;
	}
	const record = overrides as Record<string, unknown>;
	const cellSize = parsePxValue(record[GRID_LIVE_TOKEN_KEYS.cellSize]);
	const gap = parsePxValue(record[GRID_LIVE_TOKEN_KEYS.gap]);
	const radius = parsePxValue(record[GRID_LIVE_TOKEN_KEYS.radius]);
	if (
		cellSize === null ||
		cellSize <= 0 ||
		gap === null ||
		radius === null ||
		gap < 0 ||
		radius < 0
	) {
		return null;
	}
	return { cellSize, gap, radius };
};

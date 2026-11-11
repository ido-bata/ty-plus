// ── Workspace layout persisted geometry ───────────────────────────────────────
import type { WidgetType } from "@/management/widget/contract";

/**
 * One persisted **grid cell** row: stable shell `id` + rectangle on the panel grid.
 * (Whether `id` is a widget instance, preset, or group is resolved from catalogs — not encoded here.)
 */
export type LayoutItem = {
	id: string;
	x: number;
	y: number;
	width: number;
	height: number;
};

/** `placementId` → catalog `presetRefId` for tiles (duplicates share one ref). */
type PersistedPresetPlacementRow = {
	placementId: string;
	presetRefId: string;
};

/**
 * Persisted workspace layout JSON for one panel file (`workspace-N.json`):
 * ordered `gridCells` (each cell’s shell id + geometry), optional `presetLayoutRoster`.
 */
export type PersistedLayoutDocument = {
	gridCells: LayoutItem[];
	presetLayoutRoster?: readonly PersistedPresetPlacementRow[];
};

type PresetPlacement = { placementId: string; presetRefId: string };

const normalizeGeometry = (raw: {
	id: string;
	x: unknown;
	y: unknown;
	width: unknown;
	height: unknown;
}): LayoutItem | null => {
	const id = String(raw.id ?? "").trim();
	if (id === "") return null;
	if (
		!Number.isFinite(raw.x) ||
		!Number.isFinite(raw.y) ||
		!Number.isFinite(raw.width) ||
		!Number.isFinite(raw.height)
	) {
		return null;
	}
	return {
		id,
		x: Math.max(0, Math.round(Number(raw.x))),
		y: Math.max(0, Math.round(Number(raw.y))),
		width: Math.max(1, Math.round(Number(raw.width))),
		height: Math.max(1, Math.round(Number(raw.height))),
	};
};

const parsePresetLayoutRosterField = (value: unknown): PresetPlacement[] => {
	if (!Array.isArray(value)) return [];
	const out: PresetPlacement[] = [];
	for (const row of value) {
		if (!row || typeof row !== "object") continue;
		const r = row as Record<string, unknown>;
		const placementId = String(r.placementId ?? "").trim();
		const presetRefId = String(r.presetRefId ?? "").trim();
		if (placementId && presetRefId) {
			out.push({ placementId, presetRefId });
		}
	}
	return out;
};

const parseCellRows = (rows: unknown[]): LayoutItem[] => {
	const cells: LayoutItem[] = [];
	for (const item of rows) {
		if (!item || typeof item !== "object") continue;
		const rec = item as Record<string, unknown>;
		const normalized = normalizeGeometry({
			id: String(rec.id ?? "").trim(),
			x: rec.x,
			y: rec.y,
			width: rec.width,
			height: rec.height,
		});
		if (!normalized) continue;
		cells.push(normalized);
	}
	return cells;
};

/**
 * Parse persisted workspace layout JSON: plain array of cell rows, or object with
 * `gridCells` and optional `presetLayoutRoster`.
 * Reads legacy `{ items: [...] }` objects only (same shape as `gridCells`); new writes use `gridCells`.
 * Unknown keys (including historical `version`) are ignored.
 */
export const parseLayoutDocument = (
	value: unknown,
): PersistedLayoutDocument => {
	const empty = (): PersistedLayoutDocument => ({ gridCells: [] });

	if (value === null || value === undefined) return empty();

	if (Array.isArray(value)) {
		return { gridCells: parseCellRows(value) };
	}

	if (typeof value === "object") {
		const obj = value as Record<string, unknown>;
		const rowsRaw = Array.isArray(obj.gridCells)
			? obj.gridCells
			: Array.isArray(obj.items)
				? obj.items
				: null;
		if (rowsRaw) {
			const cells = parseCellRows(rowsRaw as unknown[]);
			const roster = parsePresetLayoutRosterField(obj.presetLayoutRoster);
			return {
				gridCells: cells,
				presetLayoutRoster: roster.length > 0 ? roster : undefined,
			};
		}
	}

	return empty();
};

/**
 * A persisted layout body that cannot be read back.
 *
 * `reason` separates "the bytes are not JSON" from "the JSON is not a layout",
 * because the two point at different things going wrong. Both are fatal for a
 * caller that intends to write back what it read: treating either as an empty
 * panel would destroy every tile already on disk (Issue #182).
 */
export class LayoutDocumentParseError extends Error {
	readonly reason: "json-parse-failed" | "unrecognized-shape";

	constructor(
		reason: "json-parse-failed" | "unrecognized-shape",
		message: string,
	) {
		super(message);
		this.name = "LayoutDocumentParseError";
		this.reason = reason;
	}
}

/** A root that `parseLayoutDocument` would silently turn into an empty grid. */
const hasRecognizedLayoutShape = (value: unknown): boolean => {
	if (Array.isArray(value)) return true;
	if (value === null || typeof value !== "object") return false;
	const obj = value as Record<string, unknown>;
	return Array.isArray(obj.gridCells) || Array.isArray(obj.items);
};

/**
 * Read a persisted layout body, refusing to call anything unreadable "empty".
 *
 * No file (or a blank one) is a genuinely untouched panel and parses to an
 * empty grid. Anything else either parses to a recognized layout or throws
 * `LayoutDocumentParseError` — it never collapses to `{ gridCells: [] }`,
 * which is the shape that makes a later write erase the panel.
 *
 * The distinction cannot be made through `parseLayoutDocument`: that function
 * deliberately never throws, so an object that is not a layout at all is
 * indistinguishable from a panel the user emptied. A caller that only reads
 * can keep using it; a caller that writes back must use this.
 */
export const parseLayoutDocumentJsonText = (
	raw: string | null | undefined,
): PersistedLayoutDocument => {
	if (raw === null || raw === undefined || !raw.trim()) {
		return { gridCells: [] };
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (error) {
		throw new LayoutDocumentParseError(
			"json-parse-failed",
			`layout is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
	if (!hasRecognizedLayoutShape(parsed)) {
		const root =
			parsed === null
				? "null"
				: Array.isArray(parsed)
					? "array"
					: typeof parsed;
		throw new LayoutDocumentParseError(
			"unrecognized-shape",
			`layout root must be an array or an object carrying gridCells/items, got ${root}`,
		);
	}
	return parseLayoutDocument(parsed);
};

export const serializePersistedLayoutDocument = (
	doc: PersistedLayoutDocument,
): string => {
	const cells = doc.gridCells.map((it) => ({
		id: it.id,
		x: it.x,
		y: it.y,
		width: it.width,
		height: it.height,
	}));
	const out: Record<string, unknown> = { gridCells: cells };
	if (doc.presetLayoutRoster?.length) {
		out.presetLayoutRoster = doc.presetLayoutRoster.map((p) => ({
			placementId: p.placementId,
			presetRefId: p.presetRefId,
		}));
	}
	return `${JSON.stringify(out, null, 2)}\n`;
};

/** Parses unknown JSON (file body or embedded array) into normalized grid cell rows. */
export const parseGridCells = (value: unknown): LayoutItem[] =>
	parseLayoutDocument(value).gridCells;

/** Serializes a layout document (`gridCells` geometry rows only). */
export const toGridCellsJson = (gridCells: readonly LayoutItem[]): string =>
	serializePersistedLayoutDocument({
		gridCells: [...gridCells],
	});

/** Seed for one panel when initializing workspace layout files. */
export type PanelLayoutSeed = {
	gridCells: readonly LayoutItem[];
};

// ── Grid settings (mirrors settings.workspace.grid) ──────────────────────
export type GridSettings = {
	cellSize: number;
	gap: number;
	radius: number;
};

// ── Widget layout (grid cell coordinates) ─────────────────────────────────
/** Opaque widget **instance** id (persisted). Never encode widget kind in this string. */
type InstanceId = string;

/** @deprecated Use `InstanceId`; kept for incremental refactors. */
type WidgetId = string;

export type Layout = {
	id: InstanceId;
	/** @deprecated same as `id`; some persisted rows only had `widgetId` */
	widgetId?: InstanceId;
	widgetType: WidgetType;
	x: number;
	y: number;
	width: number;
	height: number;
	data?: Record<string, unknown>;
};

export type PresetLayout = {
	x: number;
	y: number;
	width: number;
	height: number;
};

/** Compatibility: keep unknown ids in legacy data (empty impl handled by render) */
export const stripObsoleteLayouts = (widgets: Layout[]): Layout[] => widgets;

import { isWidgetType, WIDGET_TYPES } from "@/function/widget/contract";
import { inferWidgetTypeFromLegacyLayoutId } from "@/function/widget/legacy-parse";
import type { Preset } from "@/management/preset/contract";
import { stripKnownIdPrefixes } from "@/management/storage/ids";
import type { Layout } from "@/management/workspace/layout/grid-document";
import type { SurfaceState } from "@/management/workspace/state";
import {
	classifyFromCatalogs,
	type Role,
} from "@/management/workspace/surface/tiles";

const parseSurfaceIndex = (raw: string): number | null => {
	const n = Number.parseInt(raw.trim(), 10);
	return Number.isFinite(n) && n >= 0 ? n : null;
};

/** Tile id is registered in `widgetInstanceTypes` (same id as `surfaceTiles[i].id`). */
const tileIdHasWidgetInstanceBinding = (
	state: Pick<SurfaceState, "widgetInstanceTypes">,
	tileId: string,
): boolean => {
	const wt = state.widgetInstanceTypes[tileId.trim()];
	return typeof wt === "string" && isWidgetType(wt);
};

/**
 * Whether this surface tile id represents a widget placement (binding table or legacy layout id).
 * Does not use catalog role classification — only widget registration data.
 */
export const tileIdResolvesAsWidget = (
	state: Pick<SurfaceState, "widgetInstanceTypes">,
	tileId: string,
): boolean => {
	if (tileIdHasWidgetInstanceBinding(state, tileId)) return true;
	const inferred = inferWidgetTypeFromLegacyLayoutId(
		tileId.trim(),
		WIDGET_TYPES,
	);
	return typeof inferred === "string" && isWidgetType(inferred);
};

const classifyCtx = (
	state: Pick<
		SurfaceState,
		"widgetInstanceTypes" | "groupCatalogEntries" | "presets"
	>,
): Pick<
	SurfaceState,
	"widgetInstanceTypes" | "groupCatalogEntries" | "presets"
> => state;

/**
 * Classifies a surface tile `id` using widgets.json (`widgetInstanceTypes`),
 * `groups.json` entries, then preset catalog ids.
 */
const classifySurfaceTileId = (
	state: Pick<
		SurfaceState,
		"widgetInstanceTypes" | "groupCatalogEntries" | "presets"
	>,
	tileId: string,
): Role => classifyFromCatalogs(classifyCtx(state), tileId);

/** True when index (number) points at a widget tile on the surface. */
const isWidgetFromNumber = (
	state: Pick<
		SurfaceState,
		"surfaceTiles" | "widgetInstanceTypes" | "groupCatalogEntries" | "presets"
	>,
	surfaceIndex: number,
): boolean => {
	const t = state.surfaceTiles[surfaceIndex];
	if (!t) return false;
	return tileIdResolvesAsWidget(state, t.id);
};

/** True when `surfaceIndex` (string) is the stringified surface index of a widget tile. */
export const isWidget = (
	state: Pick<
		SurfaceState,
		"surfaceTiles" | "widgetInstanceTypes" | "groupCatalogEntries" | "presets"
	>,
	surfaceIndex: string,
): boolean => {
	const idx = parseSurfaceIndex(surfaceIndex);
	return idx !== null && isWidgetFromNumber(state, idx);
};

/** True when the surface tile at `surfaceIndex` (numeric index or stringified index) is a widget. */
export const isWidgetSurfaceIndex = (
	state: Pick<
		SurfaceState,
		"surfaceTiles" | "widgetInstanceTypes" | "groupCatalogEntries" | "presets"
	>,
	surfaceIndex: number | string,
): boolean =>
	typeof surfaceIndex === "number"
		? isWidgetFromNumber(state, surfaceIndex)
		: isWidget(state, surfaceIndex);

/** Widget row for a surface index (number), if any. */
export const widgetLayoutFromNumber = (
	state: Pick<
		SurfaceState,
		"surfaceTiles" | "widgetInstanceTypes" | "groupCatalogEntries" | "presets"
	>,
	surfaceIndex: number,
): Layout | undefined => {
	const t = state.surfaceTiles[surfaceIndex];
	if (!t) return undefined;
	if (!tileIdResolvesAsWidget(state, t.id)) return undefined;
	const wt =
		state.widgetInstanceTypes[t.id] ??
		inferWidgetTypeFromLegacyLayoutId(t.id, WIDGET_TYPES);
	if (!wt || !isWidgetType(wt)) return undefined;
	return {
		id: t.id,
		widgetId: t.id,
		widgetType: wt,
		x: t.x,
		y: t.y,
		width: t.width,
		height: t.height,
	};
};

/** Widget row for a surface index (string), if any. */
const widgetLayout = (
	state: Pick<
		SurfaceState,
		"surfaceTiles" | "widgetInstanceTypes" | "groupCatalogEntries" | "presets"
	>,
	surfaceIndex: string,
): Layout | undefined => {
	const idx = parseSurfaceIndex(surfaceIndex);
	return idx === null ? undefined : widgetLayoutFromNumber(state, idx);
};

/** Catalog ref for a preset/group tile at surface index (number). */
export const catalogRefFromNumber = (
	state: Pick<
		SurfaceState,
		"surfaceTiles" | "widgetInstanceTypes" | "groupCatalogEntries" | "presets"
	>,
	surfaceIndex: number,
): string | undefined => {
	const t = state.surfaceTiles[surfaceIndex];
	if (!t) return undefined;
	if (tileIdResolvesAsWidget(state, t.id)) return undefined;
	const role = classifySurfaceTileId(state, t.id);
	if (role === "preset" || role === "group") return t.id;
	return undefined;
};

/** Catalog ref for a preset/group tile at surface index (string). */
export const catalogRef = (
	state: Pick<
		SurfaceState,
		"surfaceTiles" | "widgetInstanceTypes" | "groupCatalogEntries" | "presets"
	>,
	surfaceIndex: string,
): string | undefined => {
	const idx = parseSurfaceIndex(surfaceIndex);
	return idx === null ? undefined : catalogRefFromNumber(state, idx);
};

/** Resolve `presets.json` row for a surface tile catalog ref (incl. legacy `pcl:` ids). */
export const presetRecordForCatalogRef = (
	state: Pick<SurfaceState, "presets">,
	catalogRef: string | undefined,
): Preset | undefined => {
	const id = catalogRef?.trim() ?? "";
	if (!id) return undefined;
	const { presets } = state;
	const direct = presets.find((p) => p.id === id);
	if (direct) return direct;
	const idStripped = stripKnownIdPrefixes(id);
	if (idStripped !== id) {
		const byStrippedTile = presets.find((p) => p.id === idStripped);
		if (byStrippedTile) return byStrippedTile;
	}
	return presets.find(
		(p) => stripKnownIdPrefixes(String(p.id ?? "").trim()) === idStripped,
	);
};

const groupEntryForCatalogRef = (
	state: Pick<SurfaceState, "groupCatalogEntries">,
	catalogRef: string,
) => {
	const ref = catalogRef.trim();
	if (!ref) return undefined;
	const direct = state.groupCatalogEntries.find((g) => g.id.trim() === ref);
	if (direct) return direct;
	const refStripped = stripKnownIdPrefixes(ref);
	if (refStripped !== ref) {
		const byStrippedRef = state.groupCatalogEntries.find(
			(g) => g.id.trim() === refStripped,
		);
		if (byStrippedRef) return byStrippedRef;
	}
	return state.groupCatalogEntries.find(
		(g) => stripKnownIdPrefixes(g.id.trim()) === refStripped,
	);
};

const isGroup = (
	state: Pick<
		SurfaceState,
		"surfaceTiles" | "widgetInstanceTypes" | "groupCatalogEntries" | "presets"
	>,
	surfaceIndex: string,
): boolean => {
	const ref = catalogRef(state, surfaceIndex);
	if (!ref) return false;
	return classifySurfaceTileId(state, ref) === "group";
};

/** Map surface index strings to catalog refs; drops unknown / widget indices. */
export const catalogRefsForSurfaceIds = (
	state: Pick<
		SurfaceState,
		"surfaceTiles" | "widgetInstanceTypes" | "groupCatalogEntries" | "presets"
	>,
	surfaceIndices: readonly string[],
): string[] => {
	const out: string[] = [];
	const seen = new Set<string>();
	for (const raw of surfaceIndices) {
		const ref = catalogRef(state, raw);
		if (!ref || seen.has(ref)) continue;
		seen.add(ref);
		out.push(ref);
	}
	return out;
};

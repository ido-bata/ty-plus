/**
 * Workspace placement gateway  Esingle entry for adding layout rows when geometry is
 * omitted (auto-pack) vs explicit x/y/w/h.
 *
 * - Default auto strategy: 6ÁE0 column bands (`axis === -1`).
 * - Optional anchor + axis priority for “grow from here Eplacement.
 */

import type {
	Layout,
	LayoutItem,
} from "@/management/workspace/layout/grid-document";
import {
	type CellRect,
	packRectsInColumnBands,
	packRectsInOverflowScan,
	packRectsNearAnchor,
} from "@/management/workspace/placement/column-band-pack";

/** Default onboarding / panel tile size for catalog presets & folder groups. */
export const DEFAULT_TILE_WIDTH = 1;
export const DEFAULT_TILE_HEIGHT = 1;

/** -1: column-band packing; 0|1: anchor-based axis priority for near-anchor growth. */
type AutoAxis = -1 | 0 | 1;

export type PresetPlacementRequest = {
	/** Catalog preset or folder-group preset id */
	presetRefId: string;
	width?: number;
	height?: number;
};

import type { AutoPackOptions } from "@/management/workspace/placement/contract";

const widgetRectsFromLayouts = (
	widgets: readonly Pick<Layout, "x" | "y" | "width" | "height">[],
): CellRect[] =>
	widgets.map((w) => ({
		x: w.x,
		y: w.y,
		width: Math.max(1, w.width),
		height: Math.max(1, w.height),
	}));

const normalizeOccupiedRects = (rects: readonly CellRect[]): CellRect[] =>
	rects.map((r) => ({
		x: r.x,
		y: r.y,
		width: Math.max(1, r.width),
		height: Math.max(1, r.height),
	}));

export type BuiltLayoutWithPresets = {
	/** Widget rows + preset tiles; preset tiles use catalog id as the layout row `id`. */
	layoutItems: LayoutItem[];
};

/**
 * Merge widget layout JSON rows with auto-placed preset tiles (row `id` = catalog ref).
 *
 * `additionalOccupiedRects`  Eexisting preset (or other) tiles that must be treated as
 * blocking cells alongside widgets (panel incremental adds, moves, etc.).
 */
const layoutWithAutoPresets = (input: {
	widgetLayouts: readonly Layout[];
	presetRequests: readonly PresetPlacementRequest[];
	additionalOccupiedRects?: readonly CellRect[] | null;
	auto?: AutoPackOptions | null;
	defaultTile?: { width: number; height: number };
}): BuiltLayoutWithPresets => {
	const dw = input.defaultTile?.width ?? DEFAULT_TILE_WIDTH;
	const dh = input.defaultTile?.height ?? DEFAULT_TILE_HEIGHT;

	const widgetItems: LayoutItem[] = input.widgetLayouts.map((w) => ({
		id: w.id,
		x: w.x,
		y: w.y,
		width: Math.max(1, w.width),
		height: Math.max(1, w.height),
	}));

	const occupiedFromWidgets = widgetRectsFromLayouts(input.widgetLayouts);
	const extra = normalizeOccupiedRects(input.additionalOccupiedRects ?? []);
	const occupiedBase: CellRect[] = [...occupiedFromWidgets, ...extra];

	const sized = input.presetRequests.map((r) => ({
		width: Math.max(1, r.width ?? dw),
		height: Math.max(1, r.height ?? dh),
		presetRefId: r.presetRefId,
	}));

	const axis = input.auto?.axis ?? -1;
	let geom: CellRect[];

	if (axis === -1) {
		const narrowIndices: number[] = [];
		const wideIndices: number[] = [];
		for (let i = 0; i < sized.length; i++) {
			if (sized[i].width > 6) {
				wideIndices.push(i);
			} else {
				narrowIndices.push(i);
			}
		}
		const narrow = narrowIndices.map((i) => sized[i]);
		const wide = wideIndices.map((i) => sized[i]);
		const narrowGeom = packRectsInColumnBands(occupiedBase, narrow);
		const combinedOccupied = [...occupiedBase, ...narrowGeom];
		const wideGeom =
			wide.length > 0 ? packRectsInOverflowScan(combinedOccupied, wide) : [];
		geom = new Array<CellRect>(sized.length);
		for (let j = 0; j < narrowIndices.length; j++) {
			const rect = narrowGeom[j];
			const orig = narrowIndices[j];
			if (rect === undefined || orig === undefined) {
				throw new Error("workspace placement: narrow band geometry mismatch");
			}
			geom[orig] = rect;
		}
		for (let j = 0; j < wideIndices.length; j++) {
			const rect = wideGeom[j];
			const orig = wideIndices[j];
			if (rect === undefined || orig === undefined) {
				throw new Error("workspace placement: wide overflow geometry mismatch");
			}
			geom[orig] = rect;
		}
	} else {
		const anchor = input.auto?.anchor ?? { x: 0, y: 0 };
		const priority: 0 | 1 = axis === 1 ? 1 : 0;
		geom = packRectsNearAnchor(occupiedBase, sized, anchor, priority);
	}

	const presetItems: LayoutItem[] = sized.map((s, i) => {
		const g = geom[i];
		if (g === undefined) {
			throw new Error("workspace placement: missing geometry for preset tile");
		}
		return {
			id: s.presetRefId,
			x: g.x,
			y: g.y,
			width: g.width,
			height: g.height,
		};
	});

	return {
		layoutItems: [...widgetItems, ...presetItems],
	};
};

/**
 * Auto-pack **new** preset tiles against widget geometry + existing preset rectangles.
 * Returns one row per `presetRequests` entry (same order).
 */
export const autoPlaceRequestsOnGrid = (input: {
	widgetLayouts: readonly Layout[];
	existingPresetRects: readonly CellRect[];
	presetRequests: readonly PresetPlacementRequest[];
	auto?: AutoPackOptions | null;
	defaultTile?: { width: number; height: number };
}): Array<{
	presetRefId: string;
	x: number;
	y: number;
	width: number;
	height: number;
}> => {
	const built = layoutWithAutoPresets({
		widgetLayouts: input.widgetLayouts,
		presetRequests: input.presetRequests,
		additionalOccupiedRects: input.existingPresetRects,
		auto: input.auto,
		defaultTile: input.defaultTile,
	});
	const offset = input.widgetLayouts.length;
	const slice = built.layoutItems.slice(offset);
	return slice.map((item) => ({
		presetRefId: item.id,
		x: item.x,
		y: item.y,
		width: item.width,
		height: item.height,
	}));
};

/**
 * Onboarding helper: bootstrap widgets + panel ref ids (folder groups + loose files).
 */
export const buildOnboardingLayoutItems = (input: {
	bootstrapWidgets: readonly Layout[];
	panelPresetRefIds: readonly string[];
	auto?: AutoPackOptions | null;
}): BuiltLayoutWithPresets =>
	layoutWithAutoPresets({
		widgetLayouts: input.bootstrapWidgets,
		presetRequests: input.panelPresetRefIds.map((id) => ({ presetRefId: id })),
		auto: input.auto ?? { axis: -1 },
	});

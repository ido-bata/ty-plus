/**
 * Widget management module — add, remove, placement, registry access.
 *
 * Wave 2 task: F8
 */

import type { WidgetType } from "@/function/widget/contract";
import { registry } from "@/management/widget/registry";
import { buildPrimaryPanelWidgets as buildPrimaryPanelWidgetsFn } from "@/management/workspace/layout/default";
import type { Layout } from "@/management/workspace/layout/grid-document";
import { stripObsoleteLayouts as stripObsoleteLayoutsFn } from "@/management/workspace/layout/grid-document";
import { tileIdResolvesAsWidget as tileIdResolvesAsWidgetFn } from "@/management/workspace/placement/resolve";
import type { SurfaceState } from "@/management/workspace/state";
import type { Tile } from "@/management/workspace/surface/tiles";
import {
	clipSelection,
	layoutsFromSurface,
	widgetResolutionFromCatalogContext,
} from "@/management/workspace/surface/tiles";

export type { Layout,  };

/**
 * Widget record as stored in the widget records file.
 */
type WidgetRecord = {
	id: string;
	type: string;
	x: number;
	y: number;
	width: number;
	height: number;
};

/**
 * Appends a widget to the workspace surface from a bus payload.
 * Returns the updated surface tiles and widget instance types.
 */
const appendWidgetFromBusPayload = (
	widgetTypeRaw: string,
	cur: SurfaceState,
): Pick<SurfaceState, "surfaceTiles" | "widgetInstanceTypes"> => {
	const cfg = registry.getConfig(widgetTypeRaw as WidgetType);
	if (!cfg?.available) {
		return {
			surfaceTiles: cur.surfaceTiles,
			widgetInstanceTypes: cur.widgetInstanceTypes,
		};
	}
	const id = registry.createId(widgetTypeRaw as WidgetType);
	const { cols, rows } = cfg.defaultSize;
	const widgets = layoutsFromSurface(
		cur.surfaceTiles,
		widgetResolutionFromCatalogContext(cur),
	);
	let maxY = 0;
	for (const w of widgets) {
		const b = w.y + w.height;
		if (b > maxY) maxY = b;
	}
	const nextTile: Tile = {
		id,
		x: 0,
		y: maxY,
		width: cols,
		height: rows,
	};
	const nextTiles: Tile[] = [...cur.surfaceTiles, nextTile];
	const nextWidgets = layoutsFromSurface(
		nextTiles,
		widgetResolutionFromCatalogContext({
			...cur,
			widgetInstanceTypes: {
				...cur.widgetInstanceTypes,
				[id]: widgetTypeRaw as WidgetType,
			},
		}),
	);
	void nextWidgets;
	return {
		surfaceTiles: nextTiles,
		widgetInstanceTypes: {
			...cur.widgetInstanceTypes,
			[id]: widgetTypeRaw as WidgetType,
		},
	};
};

/**
 * Removes widgets from the workspace surface.
 */
const removeWidgetsFromState = (
	idsToRemove: string[],
	cur: SurfaceState,
): Pick<SurfaceState, "surfaceTiles" | "widgetInstanceTypes"> => {
	const removeSet = new Set(
		idsToRemove.flatMap((id) => {
			const trimmed = id.trim();
			return trimmed ? [trimmed] : [];
		}),
	);
	const nextTiles = cur.surfaceTiles.filter((t) => !removeSet.has(t.id));
	const nextWidgetInstanceTypes = { ...cur.widgetInstanceTypes };
	for (const id of removeSet) {
		delete nextWidgetInstanceTypes[id];
	}
	return {
		surfaceTiles: nextTiles,
		widgetInstanceTypes: nextWidgetInstanceTypes,
	};
};

/**
 * Applies widget placements from a layout (undo/redo).
 * Returns the updated surface tiles, widget instance types, and selected indices.
 */
export const applyWidgets = (
	widgets: Layout[] | null,
	cur: SurfaceState,
): Pick<
	SurfaceState,
	"surfaceTiles" | "widgetInstanceTypes" | "selectedSurfaceIndices"
> | null => {
	if (!widgets) return null;
	const cleaned = stripObsoleteLayoutsFn(widgets);
	const preserved = cur.surfaceTiles.filter(
		(t) =>
			!t ||
			!tileIdResolvesAsWidgetFn(
				{ widgetInstanceTypes: cur.widgetInstanceTypes },
				t.id,
			),
	);
	const nextWidgetTiles = cleaned.map((w) => ({
		id: w.id,
		x: w.x,
		y: w.y,
		width: w.width,
		height: w.height,
	}));
	const nextWidgetTypes: Record<string, WidgetType> = {
		...cur.widgetInstanceTypes,
	};
	for (const w of cleaned) {
		// Snapshot restore passes `LayoutItem[]` (no `widgetType`) via a
		// `Layout[]` cast in `history.saveSnapshot`. In that case the
		// authoritative widget type lives in `cur.widgetInstanceTypes`
		// (reloaded from the widget records file), so we must not clobber
		// it with `undefined`.
		if (w.widgetType) {
			nextWidgetTypes[w.id] = w.widgetType as WidgetType;
		}
	}
	return {
		surfaceTiles: [...nextWidgetTiles, ...preserved],
		widgetInstanceTypes: nextWidgetTypes,
		selectedSurfaceIndices: clipSelection(
			cur.selectedSurfaceIndices,
			nextWidgetTiles.length + preserved.length,
		),
	};
};

/**
 * Creates a new widget instance ID from the registry.
 */
const createWidgetId = (widgetType: WidgetType): string => {
	return registry.createId(widgetType);
};

/**
 * Builds the primary (default) panel widgets.
 */
const buildPrimaryPanelWidgets = buildPrimaryPanelWidgetsFn;

/**
 * Strips obsolete layouts from the widget list.
 */
const stripObsoleteLayouts = stripObsoleteLayoutsFn;

/**
 * Resolves whether a tile ID corresponds to a widget.
 */
const tileIdResolvesAsWidget = (
	tileId: string,
	state: Pick<SurfaceState, "widgetInstanceTypes">,
): boolean => {
	return tileIdResolvesAsWidgetFn(state, tileId);
};

/**
 * Moves widgets to another panel.
 * Returns updated surface tiles and widget instance types with the moved widgets removed.
 * For cross-panel persistence, the caller must invoke applyInterPanelMove separately.
 */
const moveWidgetsToPanel = (
	idsToMove: string[],
	_targetPanel: string,
	_state: SurfaceState,
	_crossPanelMove: boolean,
): Pick<SurfaceState, "surfaceTiles" | "widgetInstanceTypes"> => {
	const moveSet = new Set(
		idsToMove.flatMap((id) => {
			const trimmed = id.trim();
			return trimmed ? [trimmed] : [];
		}),
	);
	const nextTiles = _state.surfaceTiles.filter((t) => !moveSet.has(t.id));
	const nextWidgetInstanceTypes = { ..._state.widgetInstanceTypes };
	for (const id of moveSet) {
		delete nextWidgetInstanceTypes[id];
	}
	void _targetPanel;
	void _crossPanelMove;
	return {
		surfaceTiles: nextTiles,
		widgetInstanceTypes: nextWidgetInstanceTypes,
	};
};

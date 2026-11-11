/**
 * Apply `LayoutPayload` `widgetPlacement` messages to in-memory workspace state.
 * Does not touch `panelPresetIds`. New widget tiles are **auto-packed** from the top-left
 * using the same `autoPlaceRequestsOnGrid` path as `presetPlacement` / onboarding
 * (`axis: -1` column bands). Incoming `x`/`y` are ignored; `width`/`height` are kept.
 */

import { isWidgetType, type WidgetType } from "@/function/widget/contract";
import {
	autoPlaceRequestsOnGrid,
	DEFAULT_TILE_HEIGHT,
	DEFAULT_TILE_WIDTH,
	type PresetPlacementRequest,
} from "@/management/workspace/placement/gateway";
import { collectPresetRectsFromTiles } from "@/management/workspace/placement/preset-bus";
import type { SurfaceState } from "@/management/workspace/state";
import type { LayoutPayload } from "@/management/workspace/surface/contract";
import type { Tile } from "@/management/workspace/surface/tiles";
import {
	layoutsFromSurface,
	widgetResolutionFromCatalogContext,
} from "@/management/workspace/surface/tiles";

export type WidgetPlacementPayload = Extract<
	LayoutPayload,
	{ kind: "widgetPlacement" }
>;

export const mergeWidgetPlacementIntoState = (
	cur: SurfaceState,
	pl: WidgetPlacementPayload,
): Pick<SurfaceState, "surfaceTiles" | "widgetInstanceTypes"> => {
	const nextTiles: Tile[] = cur.surfaceTiles.map((t) => ({ ...t }));
	const nextTypes: Record<string, WidgetType> = {
		...cur.widgetInstanceTypes,
	};
	for (const [id, wt] of Object.entries(pl.widgetTypes)) {
		const key = String(id).trim();
		if (!key) continue;
		if (typeof wt === "string" && isWidgetType(wt)) {
			nextTypes[key] = wt;
		}
	}
	const catalogCtx: Pick<
		SurfaceState,
		"widgetInstanceTypes" | "groupCatalogEntries" | "presets"
	> = {
		widgetInstanceTypes: nextTypes,
		groupCatalogEntries: cur.groupCatalogEntries,
		presets: cur.presets,
	};

	// Issue #146 / Blocker 15 — idempotent merge on widget tile id.
	// Re-running the same cross-panel move (after a transient failure or
	// a manual retry) was previously producing a DUPLICATE tile for the
	// same widget id because `nextTiles.push(...)` ran unconditionally.
	// Filter incoming tile ids against existing `surfaceTiles` so retries
	// place each widget at most once. The widget is already on this panel
	// — leave the existing tile (and any explicit placement) untouched.
	const alreadyPlacedIds = new Set<string>();
	for (const tile of cur.surfaceTiles) {
		const id = tile.id?.trim();
		if (id) alreadyPlacedIds.add(id);
	}

	const requests: PresetPlacementRequest[] = [];
	for (const row of pl.tiles) {
		const id = String(row.id ?? "").trim();
		if (!id) continue;
		if (alreadyPlacedIds.has(id)) continue;
		requests.push({
			presetRefId: id,
			width: Math.max(1, row.width),
			height: Math.max(1, row.height),
		});
	}

	if (requests.length === 0) {
		return { surfaceTiles: nextTiles, widgetInstanceTypes: nextTypes };
	}

	const widgetLayouts = layoutsFromSurface(
		nextTiles,
		widgetResolutionFromCatalogContext(catalogCtx),
	);
	const presetOccupied = collectPresetRectsFromTiles(nextTiles, catalogCtx);

	const placed = autoPlaceRequestsOnGrid({
		widgetLayouts,
		existingPresetRects: presetOccupied,
		presetRequests: requests,
		auto: pl.auto ?? { axis: -1 },
		defaultTile: pl.defaultTile ?? {
			width: DEFAULT_TILE_WIDTH,
			height: DEFAULT_TILE_HEIGHT,
		},
	});

	for (const row of placed) {
		nextTiles.push({
			id: row.presetRefId,
			x: row.x,
			y: row.y,
			width: row.width,
			height: row.height,
		});
	}

	return { surfaceTiles: nextTiles, widgetInstanceTypes: nextTypes };
};

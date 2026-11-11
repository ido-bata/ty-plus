/**
 * Apply `LayoutPayload` presetPlacement messages to in-memory workspace state.
 * Ensures auto-packed geometry (gateway) and appends catalog-backed preset/group surface tiles.
 */

import type { CellRect } from "@/management/workspace/placement/column-band-pack";
import {
	autoPlaceRequestsOnGrid,
	DEFAULT_TILE_HEIGHT,
	DEFAULT_TILE_WIDTH,
	type PresetPlacementRequest,
} from "@/management/workspace/placement/gateway";
import { tileIdResolvesAsWidget } from "@/management/workspace/placement/resolve";
import type { SurfaceState } from "@/management/workspace/state";
import type { LayoutPayload } from "@/management/workspace/surface/contract";
import type { Tile } from "@/management/workspace/surface/tiles";
import {
	layoutsFromSurface,
	widgetResolutionFromCatalogContext,
} from "@/management/workspace/surface/tiles";

export type PresetPlacementPayload = Extract<
	LayoutPayload,
	{ kind: "presetPlacement" }
>;

const normalizeLayoutRect = (rect: {
	x: number;
	y: number;
	width: number;
	height: number;
}): { x: number; y: number; width: number; height: number } => ({
	x: rect.x,
	y: rect.y,
	width: Math.max(1, rect.width),
	height: Math.max(1, rect.height),
});

/** Occupied rects for catalog presets / groups (excludes widget tiles). */
export const collectPresetRectsFromTiles = (
	tiles: readonly Tile[],
	catalogCtx: Pick<
		SurfaceState,
		"widgetInstanceTypes" | "groupCatalogEntries" | "presets"
	>,
): CellRect[] => {
	const out: CellRect[] = [];
	for (const t of tiles) {
		if (tileIdResolvesAsWidget(catalogCtx, t.id)) {
			continue;
		}
		out.push(
			normalizeLayoutRect({
				x: t.x,
				y: t.y,
				width: t.width,
				height: t.height,
			}),
		);
	}
	return out;
};

const resolveMoveTokenLayout = (
	state: SurfaceState,
	token: string,
): { x: number; y: number; width: number; height: number } | null => {
	const trimmed = token.trim();
	if (!trimmed) {
		return null;
	}
	const catalogCtx = state;
	const asIdx = Number.parseInt(trimmed, 10);
	if (
		Number.isFinite(asIdx) &&
		asIdx >= 0 &&
		asIdx < state.surfaceTiles.length
	) {
		const t = state.surfaceTiles[asIdx];
		if (t && !tileIdResolvesAsWidget(catalogCtx, t.id)) {
			return normalizeLayoutRect(t);
		}
	}
	for (const t of state.surfaceTiles) {
		if (tileIdResolvesAsWidget(catalogCtx, t.id)) {
			continue;
		}
		if (t.id === trimmed) {
			return normalizeLayoutRect(t);
		}
	}
	return null;
};

export const mergePresetPlacementIntoState = (
	cur: SurfaceState,
	pl: PresetPlacementPayload,
): Pick<SurfaceState, "surfaceTiles" | "panelPresetIds"> => {
	const incoming = pl.presetIds.flatMap((id) => {
		const trimmed = id.trim();
		return trimmed.length > 0 ? [trimmed] : [];
	});
	if (incoming.length === 0) {
		return {
			surfaceTiles: cur.surfaceTiles,
			panelPresetIds: cur.panelPresetIds,
		};
	}

	// Issue #146 / Blocker 11 — idempotent merge on presetId: if a tile
	// for the presetRefId is already present on the target surface, skip
	// re-appending it. Re-running the same cross-panel move (after a
	// transient failure or a manual retry) was previously producing a
	// duplicate tile for that preset because `nextTiles.push(...)` ran
	// unconditionally. The preset is already on this panel — leave the
	// existing tile (and any explicit placement) untouched.
	const alreadyPlacedIds = new Set<string>();
	for (const tile of cur.surfaceTiles) {
		const id = tile.id?.trim();
		if (id) alreadyPlacedIds.add(id);
	}
	const dedupedIncoming = incoming.filter(
		(presetRefId) => !alreadyPlacedIds.has(presetRefId),
	);
	if (dedupedIncoming.length === 0) {
		// Nothing to add — return the current surface unchanged.
		return {
			surfaceTiles: cur.surfaceTiles,
			panelPresetIds: cur.panelPresetIds,
		};
	}

	const nextPanelPresetIds = Array.from(
		new Set([...cur.panelPresetIds, ...dedupedIncoming]),
	);

	const nextTiles: Tile[] = cur.surfaceTiles.map((t) => ({ ...t }));
	const explicitArr = pl.explicitPlacements;

	let presetOccupied = collectPresetRectsFromTiles(nextTiles, cur);

	const autoQueue: PresetPlacementRequest[] = [];

	for (let i = 0; i < dedupedIncoming.length; i++) {
		const presetRefId = dedupedIncoming[i];
		if (!presetRefId) {
			continue;
		}
		const ex = explicitArr?.[i];
		if (
			ex &&
			typeof ex === "object" &&
			Number.isFinite(ex.x) &&
			Number.isFinite(ex.y)
		) {
			const width = Math.max(
				1,
				Number.isFinite(ex.width) ? Number(ex.width) : DEFAULT_TILE_WIDTH,
			);
			const height = Math.max(
				1,
				Number.isFinite(ex.height) ? Number(ex.height) : DEFAULT_TILE_HEIGHT,
			);
			nextTiles.push({
				id: presetRefId,
				x: ex.x,
				y: ex.y,
				width,
				height,
			});
			presetOccupied = [...presetOccupied, { x: ex.x, y: ex.y, width, height }];
		} else {
			autoQueue.push({ presetRefId });
		}
	}

	if (autoQueue.length > 0) {
		const placed = autoPlaceRequestsOnGrid({
			widgetLayouts: layoutsFromSurface(
				nextTiles,
				widgetResolutionFromCatalogContext(cur),
			),
			existingPresetRects: presetOccupied,
			presetRequests: autoQueue,
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
	}

	return {
		surfaceTiles: nextTiles,
		panelPresetIds: nextPanelPresetIds,
	};
};

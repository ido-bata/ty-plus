export * from "@/management/workspace/placement/column-band-pack";
export * from "@/management/workspace/placement/contract";
export * from "@/management/workspace/placement/gateway";
export * from "@/management/workspace/placement/preset-bus";
export * from "@/management/workspace/placement/resolve";
export * from "@/management/workspace/placement/types";
export * from "@/management/workspace/placement/widget-bus";

import type { SurfaceState } from "@/management/workspace/state";

export type Cell = {
	/** Stringified surface index (matches ATTR_PLACEMENT_INDEX / legacy placement id call sites). */
	id: string;
	x: number;
	y: number;
	width: number;
	height: number;
};

/**
 * Grid cells: one row per `surfaceTiles` entry (index order).
 */
export const deriveCells = (state: SurfaceState): Cell[] =>
	state.surfaceTiles.map((t, index) => ({
		id: String(index),
		x: t.x,
		y: t.y,
		width: t.width,
		height: t.height,
	}));

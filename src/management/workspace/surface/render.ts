/**
 * Workspace render utilities.
 * Provides computePresetGrid for events.ts.
 */

import { tileIdResolvesAsWidget } from "@/management/workspace/placement/resolve";
import type { SurfaceState } from "@/management/workspace/state";
import { classifyFromCatalogs } from "@/management/workspace/surface/tiles";

type PresetGridItem = {
	id: string;
};

export type GridPreset = {
	items: PresetGridItem[];
};

/**
 * Computes the preset grid for a workspace from surface tiles (placement id = stringified index).
 */
export const computePresetGrid = (
	state: SurfaceState,
	_baseCols: number,
): GridPreset => {
	const items: PresetGridItem[] = [];
	state.surfaceTiles.forEach((t, index) => {
		if (tileIdResolvesAsWidget(state, t.id)) return;
		const role = classifyFromCatalogs(state, t.id);
		if (role === "preset" || role === "group") {
			items.push({ id: String(index) });
		}
	});
	return { items };
};

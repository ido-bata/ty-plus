import { isWidgetType, type WidgetType } from "@/function/widget/contract";
import { inferWidgetTypeFromLegacyLayoutId } from "@/function/widget/legacy-parse";
import { createInstanceId, isOpaqueInstanceId } from "@/management/storage/ids";
import type { Layout } from "@/management/workspace/layout/grid-document";
import { tileIdResolvesAsWidget } from "@/management/workspace/placement/resolve";
import type { SurfaceState } from "@/management/workspace/state";
import type { Tile } from "@/management/workspace/surface/tiles";

const resolveLayoutEntry = (w: Layout): Layout => {
	const rawId = String(w.id ?? w.widgetId ?? "").trim();
	const typeRaw = w.widgetType as unknown;
	const widgetType: WidgetType =
		typeRaw === "search"
			? "quick-actions"
			: typeof typeRaw === "string" && isWidgetType(typeRaw)
				? typeRaw
				: (inferWidgetTypeFromLegacyLayoutId(rawId) ?? "info");
	const id = isOpaqueInstanceId(rawId) ? rawId : createInstanceId();
	return {
		...w,
		id,
		widgetId: id,
		widgetType,
	};
};

/**
 * Ensures opaque widget instance ids on widget surface rows and a valid `widgetType`
 * in `widgetInstanceTypes`. Remaps `quickActionSearchByWidgetInstanceId` when ids change.
 */
export const normalizeState = (state: SurfaceState): SurfaceState => {
	const idMap = new Map<string, string>();
	const nextTiles: Tile[] = [];
	const nextWidgetTypes: Record<string, WidgetType> = {
		...state.widgetInstanceTypes,
	};

	for (const tile of state.surfaceTiles) {
		if (!tileIdResolvesAsWidget(state, tile.id)) {
			nextTiles.push(tile);
			continue;
		}
		const wt = state.widgetInstanceTypes[tile.id] as unknown;
		const wl: Layout = {
			id: tile.id,
			widgetId: tile.id,
			widgetType:
				wt === "search"
					? "quick-actions"
					: typeof wt === "string" && isWidgetType(wt)
						? wt
						: (inferWidgetTypeFromLegacyLayoutId(tile.id) ?? "info"),
			x: tile.x,
			y: tile.y,
			width: tile.width,
			height: tile.height,
		};
		const nw = resolveLayoutEntry(wl);
		const oldId = String(tile.id ?? "").trim();
		if (oldId && oldId !== nw.id) {
			idMap.set(oldId, nw.id);
		}
		if (oldId !== nw.id && oldId in nextWidgetTypes) {
			delete nextWidgetTypes[oldId];
		}
		nextWidgetTypes[nw.id] = nw.widgetType as WidgetType;
		nextTiles.push({
			id: nw.id,
			x: nw.x,
			y: nw.y,
			width: nw.width,
			height: nw.height,
		});
	}

	const next: SurfaceState = {
		...state,
		surfaceTiles: nextTiles,
		widgetInstanceTypes: nextWidgetTypes,
	};

	return next;
};

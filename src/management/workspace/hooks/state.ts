/**
 * Workspace state helpers and types.
 */

import type { WidgetType } from "@/function/widget/contract";
import { registry } from "@/management/widget/registry";
import { buildPrimaryPanelWidgets } from "@/management/workspace/layout/default";
import { logWorkspace } from "@/management/workspace/onboarding/flow-log";
import type { SurfaceState } from "@/management/workspace/state";
import type { Tile } from "@/management/workspace/surface/tiles";
import { clipSelection } from "@/management/workspace/surface/tiles";
import { widgetResolutionFromCatalogContext } from "@/management/workspace/surface/tiles";
import { layoutsFromSurface } from "@/management/workspace/surface/tiles";

import type { Snapshot } from "@/management/workspace/undo/history";

export const fileNameFromPath = (value: string): string =>
	value.split(/[\\/]/).pop() ?? value;

export type WorkspaceUi = {
	canUndo: boolean;
	canRedo: boolean;
	snapshots: Snapshot[];
};

;

/** After `surfaceTiles` is replaced, rebuild selection indices from preserved tile ids. */
export const remapSurfaceSelectionByPreservedTileIds = (
	prevTiles: readonly Tile[],
	nextTiles: readonly Tile[],
	prevSel: readonly number[],
): number[] => {
	const idSet = new Set(
		prevSel
			.map((i) => prevTiles[i]?.id)
			.filter((id): id is string => Boolean(id?.trim())),
	);
	const nextIdx: number[] = [];
	for (let i = 0; i < nextTiles.length; i++) {
		if (idSet.has(nextTiles[i].id)) nextIdx.push(i);
	}
	return clipSelection(nextIdx, nextTiles.length);
};

const AVAILABLE_PANEL_WIDGET_TYPES = new Set<string>(
	registry.widgets.flatMap((w) => (w.available ? [w.type] : [])),
);

export const ensurePrimaryPanelWidgets = (
	state: SurfaceState,
): SurfaceState => {
	// Only `panel-1` performs default auto-placement. Additional panels
	// (panel-2..5) stay empty until the user explicitly adds widgets, so
	// each panel reads/writes its own workspace JSON without inheriting
	// the primary panel's default widget set.
	if (state.panelId !== "panel-1") {
		return state;
	}
	const widgets = layoutsFromSurface(
		state.surfaceTiles,
		widgetResolutionFromCatalogContext(state),
	);
	const hasRenderable = widgets.some(
		(w) =>
			AVAILABLE_PANEL_WIDGET_TYPES.has(w.widgetType as WidgetType) &&
			registry.getConfig(w.widgetType as WidgetType)?.available === true,
	);
	if (hasRenderable) {
		return state;
	}
	logWorkspace("ensurePrimaryPanelWidgets:reset-default-widgets", {
		panelId: state.panelId,
		priorWidgetCount: widgets.length,
	});
	const seedWidgets = buildPrimaryPanelWidgets();
	return {
		...state,
		surfaceTiles: seedWidgets.map((w) => ({
			id: w.id,
			x: w.x,
			y: w.y,
			width: w.width,
			height: w.height,
		})),
		widgetInstanceTypes: Object.fromEntries(
			seedWidgets.map(
				(w: ReturnType<typeof buildPrimaryPanelWidgets>[number]) => [
					w.id,
					w.widgetType,
				],
			),
		) as Record<string, WidgetType>,
		statusMessage: state.statusMessage || "Workspace layout was reset.",
	};
};

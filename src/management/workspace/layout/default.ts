import type { WidgetType } from "@/function/widget/contract";
import { createInstanceId } from "@/management/storage/ids";
import type {
	GridSettings,
	Layout,
} from "@/management/workspace/layout/grid-document";

/** Default workspace grid metrics (mirrors settings.workspace.grid). */
export const DEFAULT_GRID: GridSettings = {
	cellSize: 48,
	gap: 4,
	radius: 2,
};

type SeedTile = {
	widgetType: WidgetType;
	x: number;
	y: number;
	width: number;
	height: number;
};

/**
 * Structural default for `panel-1` (positions + kinds). Ids are assigned by
 * `buildPrimaryPanelWidgets()` so every workspace / test run gets opaque instance ids.
 */
const DEFAULT_PRIMARY_PANEL_WIDGET_SEED: readonly SeedTile[] = [
	{ widgetType: "quick-actions", x: 0, y: 0, width: 4, height: 1 },
	{ widgetType: "layout-lock", x: 4, y: 0, width: 1, height: 1 },
	{ widgetType: "menu", x: 5, y: 0, width: 1, height: 1 },
	{ widgetType: "easing", x: 0, y: 1, width: 4, height: 5 },
	{ widgetType: "align", x: 4, y: 3, width: 2, height: 3 },
	{ widgetType: "anchor-point", x: 4, y: 1, width: 2, height: 2 },
	{ widgetType: "info", x: 0, y: 6, width: 6, height: 3 },
];

/** Fresh opaque ids for each widget tile (primary panel defaults). */
export const buildPrimaryPanelWidgets = (): Layout[] =>
	DEFAULT_PRIMARY_PANEL_WIDGET_SEED.map((t) => {
		const id = createInstanceId();
		return {
			id,
			widgetId: id,
			widgetType: t.widgetType,
			x: t.x,
			y: t.y,
			width: t.width,
			height: t.height,
		};
	});

const getDefaultWidgetsForPanel = (panelId: string): Layout[] =>
	panelId === "panel-1" ? buildPrimaryPanelWidgets() : [];

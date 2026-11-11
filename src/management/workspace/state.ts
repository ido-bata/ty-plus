import type { WidgetType } from "@/function/widget";

import type { Preset } from "@/management/preset/contract";
import type { GroupCatalogEntry } from "@/management/preset/group-catalog";
import type { Background } from "@/management/workspace/background/contract";
import {
	buildPrimaryPanelWidgets,
	DEFAULT_GRID,
} from "@/management/workspace/layout/default";
import type { GridSettings } from "@/management/workspace/layout/grid-document";
import type { CompInfo } from "@/management/workspace/surface/contract";

import type { Tile } from "@/management/workspace/surface/tiles";

// Re-export layout types for backward compatibility with existing imports
export type {
	GridSettings,
	Layout,
} from "@/management/workspace/layout/grid-document";
export { stripObsoleteLayouts } from "@/management/workspace/layout/grid-document";

export type {
	AlignTargetId,
	CompInfo,
} from "@/management/workspace/surface/contract";

// ── Workspace-specific types (not part of layout system) ────────────────────

export type { Tile } from "@/management/workspace/surface/tiles";

// ── Workspace state ───────────────────────────────────────────────────────
export type SurfaceState = {
	grid: GridSettings;
	panelId: string;
	hostCode: string;
	hostName: string;
	mode: "live" | "static";
	statusMessage: string;
	/**
	 * Ordered surface tiles: each row is `{ id, x, y, width, height }` only.
	 * **Primary shell key is the array index.** `id` resolves against widgets / groups / presets.
	 */
	surfaceTiles: readonly Tile[];
	/** Widget instance id ↁEkind (widgets.json); refreshed on layout load. */
	widgetInstanceTypes: Readonly<Record<string, WidgetType>>;
	/** `ty-plus/groups/groups.json` entries (source of truth for group surface ids). */
	groupCatalogEntries: readonly GroupCatalogEntry[];
	/** Grid multi-selection: indices into `surfaceTiles`. */
	selectedSurfaceIndices: readonly number[];
	layoutLocked: boolean;
	/** Updated on bus / first sync (preset list) */
	presets: readonly Preset[];
	/** Active comp details (equivalent to AE project-info) */
	compInfo: CompInfo | null;
	compInfoError: string | null;
	/** Last clicked row in preset list (for execute button / highlight) */
	presetFocusId: string | null;
	presetHoverId: string | null;
	presetSelectedIds: readonly string[];
	/** Preset IDs assigned to panel (when empty, panel-1 shows all items) */
	panelPresetIds: readonly string[];
	/** Group preset currently being expanded (folderPreset) */
	openedGroupPresetId: string | null;
	/** Workspace grid/label display toggle (archive reserved action visualization) */
	showGridOverlay: boolean;
	showPresetLabels: boolean;
	bg: Background | null;
};

export const createInitialSurfaceState = (opts: {
	grid?: Partial<GridSettings>;
	panelId?: string;
	hostCode?: string;
	hostName?: string;
	mode: "live" | "static";
}): SurfaceState => {
	const panelId = opts.panelId ?? "panel-1";
	const defaultWidgets =
		panelId === "panel-1" ? buildPrimaryPanelWidgets() : [];
	return {
		grid: { ...DEFAULT_GRID, ...opts.grid },
		panelId,
		hostCode: opts.hostCode ?? "AEFT",
		hostName: opts.hostName ?? "After Effects",
		mode: opts.mode,
		statusMessage: "",
		surfaceTiles: defaultWidgets.map((w) => ({
			id: w.id,
			x: w.x,
			y: w.y,
			width: w.width,
			height: w.height,
		})),
		widgetInstanceTypes: Object.fromEntries(
			defaultWidgets.map((w) => [w.id, w.widgetType]),
		) as Record<string, WidgetType>,
		groupCatalogEntries: [],
		selectedSurfaceIndices: [],
		layoutLocked: false,
		presets: [],
		compInfo: null,
		compInfoError: null,
		presetFocusId: null,
		presetSelectedIds: [],
		presetHoverId: null,
		panelPresetIds: [],
		openedGroupPresetId: null,
		showGridOverlay: true,
		showPresetLabels: true,
		bg: null,
	};
};

/**
 * @deprecated Now a no-op. presetInfoLast is widget-owned; info widget reads from its own store.
 */
export const withPresetInfoSnapshot = (state: SurfaceState): SurfaceState =>
	state;

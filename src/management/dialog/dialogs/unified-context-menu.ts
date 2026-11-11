/**
 * Unified workspace context menu.
 *
 * **CEP**: Prefer `setContextMenu` (XML, 5.2+); fall back to `setContextMenuByJSON` if unavailable.
 * Pass XML/JSON on right-click to replace the host standard menu (`docs/examples/research-cep-menu.md`).
 * Previously `preventDefault` was incorrectly used, preventing native menus from appearing. **Do not call `preventDefault` / `stopPropagation` in the CEP path.**
 * In addition to callbacks, also subscribe to `com.adobe.cep.contextmenu.clicked` etc.
 * Per Adobe spec, items without id are not displayed, so headings are converted to dummy ids with `enabled:false`.
 *
 * **Control Panel**: Register `buildControlPanelContextMenuPayload()` via CEP API, same as grids etc.
 *
 * **Browser (Vite etc.)**: When CEP `setContextMenu` / `setContextMenuByJSON` is unavailable,
 * this module does not render any custom menu fallback.
 *
 * **Flat menu** (nearly abandons hit testing):
 * If `ty-plus.flat-workspace-context-menu` flag is set, `#app` interior is always
 * `{ zone: "workspace" }` same menu (`ctx-probe` / control panel / `outside` remain as before).
 *
 * **Fully disable ty-plus unified menu** (for debugging):
 * If `ty-plus.skip-unified-context-menu` flag is set, skip ty-plus registration and `preventDefault` in all zones.
 */

import { isWidgetType, WIDGET_TYPES } from "@/function/widget/contract";
import { inferWidgetTypeFromLegacyLayoutId } from "@/function/widget/legacy-parse";
import {
	CTX_MENU_IDS,
	QA_ORDER,
} from "@/management/dialog/dialogs/unified-context-menu-constants";
import type { Preset } from "@/management/preset/contract";
import { readWidgetStateJson } from "@/management/storage/widget-state-store";
import {
	EASING_CURVE_COLOR_DEFAULTS,
	EASING_CURVE_COLOR_ROWS,
	type EasingCurveColorRowKey,
} from "@/management/workspace/literals/easing-color-catalog";
import { DEFAULT_EASING_LABEL_PREFERENCES_JSON } from "@/management/workspace/literals/easing-label-preferences";
import {
	catalogRefsForSurfaceIds,
	tileIdResolvesAsWidget,
} from "@/management/workspace/placement/resolve";
import {
	ATTR_GRID,
	ATTR_GROUP_TILE,
	ATTR_PLACEMENT_INDEX,
	ATTR_PRESET_TILE,
	ATTR_WIDGET_TILE,
} from "@/management/workspace/placement/types";
import type { SurfaceState } from "@/management/workspace/state";
import type { Snapshot } from "@/management/workspace/undo/history";

export { CTX_MENU_IDS } from "@/management/dialog/dialogs/unified-context-menu-constants";

export type ContextHit =
	| { zone: "outside" }
	| { zone: "control-panel" }
	/** "RC" probe tile in lower-left (does not conflict with grid/widgets) */
	| { zone: "ctx-probe" }
	| { zone: "qa-cat"; qaCat: string }
	| { zone: "preset-row"; presetId: string }
	| { zone: "status-bar" }
	| {
			/** Placement shell on the workspace grid (`data-workspace-surface-index` value). */
			zone: "workspace-placement";
			id: string;
	  }
	| { zone: "workspace" }
	| {
			zone: "directory-browser";
			placementId?: string;
			entryKind?: "dir" | "file" | "preset";
			entryPath?: string;
			presetId?: string;
			fileType?: "image" | "video" | "audio";
	  }
	| {
			/** Anchor-point widget buttons inside a placement tile */
			zone: "anchor-point";
			anchorPosition: string;
			placementId: string;
	  };

export type CepMenuEntry = {
	id?: string;
	label: string;
	/** Section heading (non-clickable) */
	heading?: boolean;
	enabled?: boolean;
	checkable?: boolean;
	checked?: boolean;
	menu?: CepMenuEntry[];
};

export type CepMenuPayload = { menu: CepMenuEntry[] };

function _h(label: string): CepMenuEntry {
	return { label, heading: true };
}

function sep(): CepMenuEntry {
	return { label: "---" };
}

/**
 * Resolve menu key for widget-specific rows (layout lock, etc.).
 * `placementSurfaceIndex` is the grid shell's `data-workspace-surface-index` when numeric;
 * otherwise treated as a legacy logical id (e.g. tests).
 */
function logicalTileIdForWidgetMenuHit(
	placementSurfaceIndex: string,
	state: Pick<
		SurfaceState,
		"surfaceTiles" | "widgetInstanceTypes" | "groupCatalogEntries" | "presets"
	>,
): string {
	const raw = placementSurfaceIndex.trim();
	if (/^\d+$/.test(raw)) {
		const idx = Number.parseInt(raw, 10);
		const t = state.surfaceTiles[idx];
		if (
			t &&
			idx >= 0 &&
			idx < state.surfaceTiles.length &&
			tileIdResolvesAsWidget(state, t.id)
		) {
			const tileId = t.id.trim();
			const wt = state.widgetInstanceTypes[tileId];
			if (typeof wt === "string" && isWidgetType(wt)) {
				return `widget-${wt}`;
			}
			const inferred = inferWidgetTypeFromLegacyLayoutId(tileId, WIDGET_TYPES);
			if (typeof inferred === "string" && isWidgetType(inferred)) {
				return `widget-${inferred}`;
			}
			return tileId;
		}
	}
	return raw;
}

function catalogPresetIdsForWorkspaceBulk(
	state: Pick<
		SurfaceState,
		| "surfaceTiles"
		| "selectedSurfaceIndices"
		| "presetSelectedIds"
		| "presets"
		| "panelPresetIds"
	>,
): string[] {
	const fromGrid = catalogRefsForSurfaceIds(
		state as SurfaceState,
		state.selectedSurfaceIndices.map(String),
	);
	const trimmedPresets: string[] = [];
	for (const id of state.presetSelectedIds) {
		const trimmed = id.trim();
		if (trimmed) trimmedPresets.push(trimmed);
	}
	return Array.from(new Set([...fromGrid, ...trimmedPresets]));
}

/**
 * `contextmenu` `event.target` can point to text nodes only (especially CEF).
 * If so, `instanceof Element` is false and hit test becomes "outside".
 */
function contextMenuTargetElement(target: EventTarget | null): Element | null {
	if (target == null) return null;
	if (target instanceof Element) return target;
	if (typeof Node !== "undefined" && target instanceof Node) {
		return target.parentElement;
	}
	return null;
}

function parseDirectoryBrowserHit(
	el: Element,
	placementId?: string,
): ContextHit {
	const body = el.closest("[data-directory-browser-body]");
	if (!body) {
		return { zone: "directory-browser", placementId };
	}
	const row = el.closest("[data-directory-browser-entry]");
	if (!row || !body.contains(row)) {
		return { zone: "directory-browser", placementId };
	}
	const kind = row.getAttribute("data-entry-kind")?.trim();
	const entryPath = row.getAttribute("data-entry-path")?.trim() ?? "";
	const presetId = row.getAttribute("data-preset-id")?.trim() ?? "";
	const fileTypeAttr = row.getAttribute("data-entry-file-type")?.trim() as
		| "image"
		| "video"
		| "audio"
		| undefined;
	if (kind === "dir" || kind === "file" || kind === "preset") {
		return {
			zone: "directory-browser",
			placementId,
			entryKind: kind,
			entryPath,
			presetId,
			...(fileTypeAttr && { fileType: fileTypeAttr }),
		};
	}
	return { zone: "directory-browser", placementId };
}

function isNativeTextEditTarget(target: EventTarget | null): boolean {
	const el = target instanceof Element ? target : null;
	if (!el) return false;
	const h = el.closest("input, textarea, select, [contenteditable]");
	if (!h) return false;
	if (h.tagName === "INPUT") {
		const t = h.getAttribute("type")?.toLowerCase() ?? "text";
		if (
			t === "button" ||
			t === "checkbox" ||
			t === "radio" ||
			t === "submit" ||
			t === "reset" ||
			t === "range" ||
			t === "color" ||
			t === "file"
		) {
			return false;
		}
	}
	if (h.getAttribute("contenteditable") === "true") {
		return true;
	}
	return h.tagName === "TEXTAREA" || h.tagName === "SELECT";
}

function resolveContextHit(
	root: Element,
	target: EventTarget | null,
): ContextHit {
	const el = contextMenuTargetElement(target);
	if (!el || !root.contains(el)) {
		return { zone: "outside" };
	}

	const probe = el.closest(".ty-ctx-menu-probe");
	if (probe && root.contains(probe)) {
		return { zone: "ctx-probe" };
	}

	const cp = el.closest(".ty-control-panel");
	if (cp && root.contains(cp)) {
		return { zone: "control-panel" };
	}

	const qaHead = el.closest(".widget-quick-actions-cat-head[data-qa-cat]");
	if (qaHead && root.contains(qaHead)) {
		return {
			zone: "qa-cat",
			qaCat: qaHead.getAttribute("data-qa-cat") ?? "",
		};
	}

	/** Quick bar shows CEP menu for category headings only. Buttons/grid do not show unified menu (prevent DOM fallback) */
	const qaWrap = el.closest(".widget-quick-actions");
	if (qaWrap && root.contains(qaWrap)) {
		return { zone: "outside" };
	}

	const grid = el.closest(`[${ATTR_GRID}]`);
	if (grid && root.contains(grid)) {
		const tile = el.closest(`[${ATTR_PLACEMENT_INDEX}]`);
		if (tile && grid.contains(tile)) {
			/** Anchor-point widget buttons (`data-ws-action="anchor-point"`) inside tile — detect before widget placement */
			const anchorBtn = tile.querySelector('[data-ws-action="anchor-point"]');
			if (anchorBtn) {
				const anchorPos =
					anchorBtn.getAttribute("data-anchor")?.trim() ?? "center";
				return {
					zone: "anchor-point",
					anchorPosition: anchorPos,
					placementId: tile.getAttribute(ATTR_PLACEMENT_INDEX)?.trim() ?? "",
				};
			}
			if (tile.hasAttribute(ATTR_WIDGET_TILE)) {
				const body = el.closest("[data-directory-browser-body]");
				if (body && grid.contains(body)) {
					const id = tile.getAttribute(ATTR_PLACEMENT_INDEX)?.trim() ?? "";
					return parseDirectoryBrowserHit(el, id);
				}
				const id = tile.getAttribute(ATTR_PLACEMENT_INDEX)?.trim() ?? "";
				return { zone: "workspace-placement", id };
			}
			if (
				tile.hasAttribute(ATTR_PRESET_TILE) ||
				tile.hasAttribute(ATTR_GROUP_TILE)
			) {
				const id = tile.getAttribute(ATTR_PLACEMENT_INDEX)?.trim() ?? "";
				return { zone: "workspace-placement", id };
			}
		}
		// Group panel items (portal inside grid) → check for preset-row
		const gpItem = el.closest("[data-workspace-group-panel-item]");
		if (gpItem) {
			const presetId = gpItem.getAttribute("data-preset-id")?.trim() ?? "";
			if (presetId) {
				return { zone: "preset-row", presetId };
			}
		}
		return { zone: "workspace" };
	}

	const row = el.closest(
		"[data-workspace-preset-tile], [data-workspace-group-tile], [data-workspace-group-panel-item]",
	);
	if (row && root.contains(row)) {
		const presetId = row.getAttribute("data-preset-id")?.trim() ?? "";
		if (presetId) {
			return {
				zone: "preset-row",
				presetId,
			};
		}
	}

	const statusBar = el.closest(".status-bar");
	if (statusBar && root.contains(statusBar)) {
		return { zone: "status-bar" };
	}

	const shell =
		el.closest(`[${ATTR_WIDGET_TILE}]`)?.closest(`[${ATTR_PLACEMENT_INDEX}]`) ??
		el.closest(`[${ATTR_PLACEMENT_INDEX}]`);
	if (shell?.hasAttribute(ATTR_WIDGET_TILE) && root.contains(shell)) {
		const body = el.closest("[data-directory-browser-body]");
		if (body && root.contains(body)) {
			const id = shell.getAttribute(ATTR_PLACEMENT_INDEX)?.trim() ?? "";
			return parseDirectoryBrowserHit(el, id);
		}
		const id = shell.getAttribute(ATTR_PLACEMENT_INDEX)?.trim() ?? "";
		return { zone: "workspace-placement", id };
	}

	return { zone: "workspace" };
}

/** When `ty-plus.flat-workspace-context-menu === "1"`, consolidate complex hits to workspace root */
function applyFlatWorkspaceHit(hit: ContextHit, flat: boolean): ContextHit {
	if (!flat) return hit;
	if (hit.zone === "outside" || hit.zone === "control-panel") return hit;
	if (hit.zone === "ctx-probe") return hit;
	if (hit.zone === "directory-browser") return hit;
	return { zone: "workspace" };
}

function readFlatWorkspaceContextMenu(): boolean {
	try {
		return (
			window.localStorage.getItem("ty-plus.flat-workspace-context-menu") === "1"
		);
	} catch {
		return false;
	}
}

function readSkipUnifiedContextMenu(): boolean {
	try {
		return (
			window.localStorage.getItem("ty-plus.skip-unified-context-menu") === "1"
		);
	} catch {
		return false;
	}
}

type MenuCaps = { canUndo: boolean; canRedo: boolean };

function findPreset(
	presets: readonly Preset[],
	id: string,
): Preset | undefined {
	const t = id.trim();
	if (!t) return undefined;
	return presets.find((p) => p.id === t);
}

/** Archive `panelLabel`: `ty-plus ${number}` */
function panelLabel(panelId: string): string {
	const m = /^panel-(\d+)$/.exec(panelId);
	return m ? `ty-plus ${m[1]}` : panelId;
}

/** Archive "Move to panel" submenu (child ids are `movePresetsToPanelPrefix` + number) */
function movePresetsToPanelSubmenu(
	currentPanelId: string,
	includeCep: boolean,
	parentId: string,
): CepMenuEntry | null {
	if (!includeCep) return null;
	const children: CepMenuEntry[] = [];
	for (let n = 1; n <= 5; n++) {
		const pid = `panel-${n}`;
		if (pid === currentPanelId) continue;
		children.push({
			id: `${CTX_MENU_IDS.movePresetsToPanelPrefix}${n}`,
			label: panelLabel(pid),
		});
	}
	if (children.length === 0) return null;
	return {
		id: parentId,
		label: "Move to panel",
		menu: children,
	};
}

/** "Saved Layouts" submenu listing the most recent snapshots first.
 * Always returns a submenu (never null) so the option is always visible from
 * the right-click; shows a disabled "(No saved layouts)" placeholder when empty.
 */
export const buildSavedLayoutsSubmenu = (
	snapshots: readonly Snapshot[],
	includeCep: boolean,
): CepMenuEntry => {
	if (snapshots.length === 0) {
		return {
			id: CTX_MENU_IDS.savedLayoutsMenuRoot,
			label: "Saved Layouts",
			enabled: includeCep,
			menu: [
				{
					id: `${CTX_MENU_IDS.savedLayoutsMenuRoot}.empty`,
					label: "(No saved layouts)",
					enabled: false,
				},
			],
		};
	}
	return {
		id: CTX_MENU_IDS.savedLayoutsMenuRoot,
		label: "Saved Layouts",
		enabled: includeCep,
		menu: snapshots
			.slice()
			.reverse()
			.map((s) => ({
				id: `${CTX_MENU_IDS.restoreSnapshotPrefix}${s.id}`,
				label: s.label,
				enabled: includeCep,
			})),
	};
};

/** Archive empty-grid "Layout" submenu (workspace/index.tsx Layout block) */
function layoutArchiveSubmenuEntry(
	layoutLocked: boolean,
	includeCep: boolean,
	snapshots: readonly Snapshot[],
): CepMenuEntry {
	return {
		id: CTX_MENU_IDS.layoutMenuRoot,
		label: "Layout",
		menu: [
			{
				id: CTX_MENU_IDS.saveSnapshot,
				label: "Save Layout",
				enabled: includeCep,
			},
			buildSavedLayoutsSubmenu(snapshots, includeCep),
			{
				id: CTX_MENU_IDS.reloadPresets,
				label: "Reload",
				enabled: includeCep,
			},
			sep(),
			{
				id: CTX_MENU_IDS.toggleLayoutLock,
				label: layoutLocked ? "Unlock Layout" : "Lock Layout",
				checkable: true,
				checked: layoutLocked,
			},
			{
				id: CTX_MENU_IDS.packTopLeft,
				label: "Pack to Top-Left",
				enabled: includeCep && !layoutLocked,
			},
			sep(),
			{
				id: CTX_MENU_IDS.openBackground,
				label: "Background",
				enabled: includeCep,
			},
		],
	};
}

/** Archive Create Presets submenu (5 items only) */
function createPresetsArchiveEntry(includeCep: boolean): CepMenuEntry {
	return {
		id: CTX_MENU_IDS.createPresetsMenuRoot,
		label: "Create Preset",
		enabled: includeCep,
		menu: [
			{
				id: CTX_MENU_IDS.createFilePreset,
				label: "Local Preset",
				enabled: includeCep,
			},
			{
				id: CTX_MENU_IDS.createFolderPreset,
				label: "Group Preset",
				enabled: includeCep,
			},
			{
				id: CTX_MENU_IDS.createAnimationPreset,
				label: "Animation",
				enabled: includeCep,
			},
			{
				id: CTX_MENU_IDS.createLayerCompPreset,
				label: "Layer/Comp",
				enabled: includeCep,
			},
			{
				id: CTX_MENU_IDS.createCodePreset,
				label: "Code",
				enabled: includeCep,
			},
		],
	};
}

function withMoveSubmenuDisabled(entry: CepMenuEntry): CepMenuEntry {
	if (!entry.menu?.length) return { ...entry, enabled: false };
	return {
		...entry,
		enabled: false,
		menu: entry.menu.map((c) => ({ ...c, enabled: false })),
	};
}

function readFontViewerTileAspect(): "square" | "wide" {
	try {
		return window.localStorage.getItem("ty.preset-list.icon-tile-aspect") ===
			"wide"
			? "wide"
			: "square";
	} catch {
		return "square";
	}
}

// Easing widget settings cache (updated from Component via window event)
let easingBackgroundCache: "dot" | "grid" = "dot";
let easingApplyModeCache: "single" | "pair" = "pair";
let easingAutoApplyCache = true;
let easingCustomColorsCache: Partial<Record<EasingCurveColorRowKey, number>> =
	{};
let easingLabelColorNamesCache: Record<string, string> = {};
let easingMainLabelColorCache: number | null = null;
let easingClipboardCache: {
	points: {
		x: number;
		y: number;
		hIn: { x: number; y: number };
		hOut: { x: number; y: number };
	}[];
} | null = null;
let valuesClipboardCache: number[][] | null = null;

export function getEasingClipboard() {
	return easingClipboardCache;
}
export function setEasingClipboard(v: typeof easingClipboardCache) {
	easingClipboardCache = v;
}
export function getValuesClipboard() {
	return valuesClipboardCache;
}
export function setValuesClipboard(v: number[][] | null) {
	valuesClipboardCache = v;
}

export function updateEasingSettingsCache(settings: {
	background?: "dot" | "grid";
	applyMode?: "single" | "pair";
	autoApply?: boolean;
	labelColor?: number;
	customColors?: Partial<Record<EasingCurveColorRowKey, number>>;
	labelColorNames?: Record<string, string>;
}): void {
	if (settings.background !== undefined) {
		easingBackgroundCache = settings.background;
	}
	if (settings.applyMode !== undefined) {
		easingApplyModeCache = settings.applyMode;
	}
	if (settings.autoApply !== undefined) {
		easingAutoApplyCache = settings.autoApply;
	}
	if (settings.customColors !== undefined) {
		easingCustomColorsCache = settings.customColors;
	}
	if (settings.labelColorNames !== undefined) {
		easingLabelColorNamesCache = settings.labelColorNames;
	}
	if (settings.labelColor !== undefined) {
		easingMainLabelColorCache =
			settings.labelColor === 0 ? null : settings.labelColor;
	}
}

// Bundled English fallback names parsed once on module load. The widget
// dispatches AE's user-defined names at runtime when AE responds; until then
// (and as a hard fallback), these are the labels we render.
let bundledLabelNamesCache: Record<string, string> = {};
try {
	const parsed = JSON.parse(DEFAULT_EASING_LABEL_PREFERENCES_JSON) as Record<
		string,
		{ name?: string }
	>;
	const out: Record<string, string> = {};
	for (let i = 1; i <= 16; i += 1) {
		const entry = parsed[String(i)];
		if (entry && typeof entry.name === "string" && entry.name.trim()) {
			out[String(i)] = entry.name.trim();
		}
	}
	bundledLabelNamesCache = out;
} catch (_e) {
	bundledLabelNamesCache = {};
}

// resolveLabelName is inlined inside buildEasingLabelColorMenu (the pure
// menu builder) so that function can be tested in isolation without touching
// the module-level AE/bundled name caches.

// Initialize cache from storage on first load
if (typeof window !== "undefined") {
	void readWidgetStateJson(window, "easing", {})
		.then((raw) => {
			if (!raw) return;
			if (raw.backgroundPattern === "grid") {
				easingBackgroundCache = "grid";
			}
			if (raw.applyMode === "single") {
				easingApplyModeCache = "single";
			}
			if (raw.autoApply === false) {
				easingAutoApplyCache = false;
			} else if (raw.autoApply === true) {
				easingAutoApplyCache = true;
			}
			if (raw.customColors && typeof raw.customColors === "object") {
				const out: Partial<Record<EasingCurveColorRowKey, number>> = {};
				const obj = raw.customColors as Record<string, unknown>;
				for (const row of EASING_CURVE_COLOR_ROWS) {
					const v = obj[row.key];
					if (typeof v === "number" && Number.isFinite(v)) {
						if (v === -1 || (v >= 1 && v <= 16)) {
							out[row.key] = Math.round(v);
						}
					}
				}
				easingCustomColorsCache = out;
			}
			if (
				typeof raw.labelColor === "number" &&
				Number.isFinite(raw.labelColor)
			) {
				if (raw.labelColor >= 1 && raw.labelColor <= 16) {
					easingMainLabelColorCache = Math.round(raw.labelColor);
				} else if (raw.labelColor === 0) {
					easingMainLabelColorCache = null;
				}
			}
		})
		.catch(() => {});

	window.addEventListener("ty-plus:easing-settings-changed", ((
		event: Event,
	) => {
		const detail = (
			event as CustomEvent<{
				background?: "dot" | "grid";
				applyMode?: "single" | "pair";
				autoApply?: boolean;
				labelColor?: number;
				customColors?: Partial<Record<EasingCurveColorRowKey, number>>;
				labelColorNames?: Record<string, string>;
			}>
		).detail;
		if (detail.background !== undefined) {
			easingBackgroundCache = detail.background;
		}
		if (detail.applyMode !== undefined) {
			easingApplyModeCache = detail.applyMode;
		}
		if (detail.autoApply !== undefined) {
			easingAutoApplyCache = detail.autoApply;
		}
		if (detail.customColors !== undefined) {
			easingCustomColorsCache = detail.customColors;
		}
		if (detail.labelColorNames !== undefined) {
			easingLabelColorNamesCache = detail.labelColorNames;
		}
		if (detail.labelColor !== undefined) {
			easingMainLabelColorCache =
				detail.labelColor === 0 ? null : detail.labelColor;
		}
	}) as EventListener);
}

function readEasingBackground(): "dot" | "grid" {
	return easingBackgroundCache;
}

function readEasingApplyMode(): "single" | "pair" {
	return easingApplyModeCache;
}

function readEasingAutoApply(): boolean {
	return easingAutoApplyCache;
}

function _readEasingCustomColor(category: EasingCurveColorRowKey): number {
	const override = easingCustomColorsCache[category];
	if (override === -1) return -1;
	if (typeof override === "number" && override >= 1 && override <= 16) {
		return override;
	}
	return EASING_CURVE_COLOR_DEFAULTS[category] ?? 9;
}

/**
 * Build the per-curve-category "Label Color" submenu. Pure function so the
 * nesting and per-category color choices can be tested without standing up
 * the full CEP menu context. Returns an array of 9 category entries (Linear,
 * Hold, Ease In, ...), each containing 17 children (None + 16 AE colors) with
 * the user's current selection marked.
 */
export function buildEasingLabelColorMenu(
	customColors: Partial<Record<EasingCurveColorRowKey, number>>,
	aeLabelNames: Record<string, string>,
): CepMenuEntry[] {
	const resolveName = (colorIndex: number): string => {
		const key = String(colorIndex);
		const fromAe = aeLabelNames[key];
		if (fromAe?.trim()) return fromAe.trim();
		const fromBundled = bundledLabelNamesCache[key];
		if (fromBundled) return fromBundled;
		return `Color ${colorIndex}`;
	};
	const currentFor = (category: EasingCurveColorRowKey): number => {
		const override = customColors[category];
		if (override === -1) return -1;
		if (typeof override === "number" && override >= 1 && override <= 16) {
			return override;
		}
		return EASING_CURVE_COLOR_DEFAULTS[category] ?? 9;
	};
	return EASING_CURVE_COLOR_ROWS.map((row) => {
		const current = currentFor(row.key);
		const categoryMenu: CepMenuEntry[] = [];
		categoryMenu.push({
			id: `${CTX_MENU_IDS.easingLabelCategoryValuePrefix}${row.key}.none`,
			label: "None",
			checkable: true,
			checked: current === -1,
		});
		for (let i = 1; i <= 16; i += 1) {
			categoryMenu.push({
				id: `${CTX_MENU_IDS.easingLabelCategoryValuePrefix}${row.key}.${i}`,
				label: resolveName(i),
				checkable: true,
				checked: current === i,
			});
		}
		return {
			id: `${CTX_MENU_IDS.easingLabelCategoryPrefix}${row.key}`,
			label: row.label,
			menu: categoryMenu,
		};
	});
}

/**
 * Build the flat main-apply "Label Color" submenu. Distinct from
 * `buildEasingLabelColorMenu`: the user explicitly picks a single AE label
 * color to apply on the next easing apply, overriding the per-category
 * auto-resolution. Pure function so the menu structure and check-state
 * can be unit-tested without standing up the full CEP context.
 *
 * Returns 17 entries: "None" (clears the override) + 16 AE colors. The
 * `currentColor` argument is the currently-set override or null if none.
 */
export function buildEasingMainLabelColorMenu(
	currentColor: number | null,
	aeLabelNames: Record<string, string>,
): CepMenuEntry[] {
	const resolveName = (colorIndex: number): string => {
		const key = String(colorIndex);
		const fromAe = aeLabelNames[key];
		if (fromAe?.trim()) return fromAe.trim();
		const fromBundled = bundledLabelNamesCache[key];
		if (fromBundled) return fromBundled;
		return `Color ${colorIndex}`;
	};
	const out: CepMenuEntry[] = [];
	out.push({
		id: `${CTX_MENU_IDS.easingMainLabelColorValuePrefix}none`,
		label: "None",
		checkable: true,
		checked: currentColor === null,
	});
	for (let i = 1; i <= 16; i += 1) {
		out.push({
			id: `${CTX_MENU_IDS.easingMainLabelColorValuePrefix}${i}`,
			label: resolveName(i),
			checkable: true,
			checked: currentColor === i,
		});
	}
	return out;
}

export function readEasingMainLabelColor(): number | null {
	return easingMainLabelColorCache;
}

// Align widget target cache (updated from Component via window event)
let alignTargetCache = "comp";

export function updateAlignTargetCache(target: string): void {
	alignTargetCache = target;
}

// Initialize cache from storage on first load
if (typeof window !== "undefined") {
	void readWidgetStateJson(window, "align", {})
		.then((raw) => {
			if (!raw) return;
			if (typeof raw.alignTarget === "string") {
				alignTargetCache = raw.alignTarget;
			}
		})
		.catch(() => {});

	window.addEventListener("ty-plus:align-target-changed", ((event: Event) => {
		const detail = (event as CustomEvent<{ target?: string }>).detail;
		if (detail.target !== undefined) {
			alignTargetCache = detail.target;
		}
	}) as EventListener);
}

function readAlignTarget(): string {
	return alignTargetCache;
}

function buildAlignContextMenu(currentTarget: string): CepMenuEntry[] {
	return [
		// Align submenu
		{
			id: "ty.ctx.align.align",
			label: "Align",
			menu: [
				{ id: `${CTX_MENU_IDS.alignActionPrefix}align-left`, label: "Left" },
				{
					id: `${CTX_MENU_IDS.alignActionPrefix}align-center-h`,
					label: "Center H",
				},
				{ id: `${CTX_MENU_IDS.alignActionPrefix}align-right`, label: "Right" },
				sep(),
				{ id: `${CTX_MENU_IDS.alignActionPrefix}align-top`, label: "Top" },
				{
					id: `${CTX_MENU_IDS.alignActionPrefix}align-center-v`,
					label: "Center V",
				},
				{
					id: `${CTX_MENU_IDS.alignActionPrefix}align-bottom`,
					label: "Bottom",
				},
			],
		},
		// Distribute submenu
		{
			id: "ty.ctx.align.distribute",
			label: "Distribute",
			menu: [
				{
					id: `${CTX_MENU_IDS.alignActionPrefix}distribute-left`,
					label: "Left",
				},
				{
					id: `${CTX_MENU_IDS.alignActionPrefix}distribute-center-h`,
					label: "Center H",
				},
				{
					id: `${CTX_MENU_IDS.alignActionPrefix}distribute-right`,
					label: "Right",
				},
				sep(),
				{ id: `${CTX_MENU_IDS.alignActionPrefix}distribute-top`, label: "Top" },
				{
					id: `${CTX_MENU_IDS.alignActionPrefix}distribute-center-v`,
					label: "Center V",
				},
				{
					id: `${CTX_MENU_IDS.alignActionPrefix}distribute-bottom`,
					label: "Bottom",
				},
			],
		},
		// Spacing submenu
		{
			id: "ty.ctx.align.spacing",
			label: "Spacing",
			menu: [
				{
					id: `${CTX_MENU_IDS.alignActionPrefix}distribute-spacing-h`,
					label: "Spacing H",
				},
				{
					id: `${CTX_MENU_IDS.alignActionPrefix}distribute-h`,
					label: "Distribute H",
				},
				sep(),
				{
					id: `${CTX_MENU_IDS.alignActionPrefix}distribute-spacing-v`,
					label: "Spacing V",
				},
				{
					id: `${CTX_MENU_IDS.alignActionPrefix}distribute-v`,
					label: "Distribute V",
				},
			],
		},
		// Time submenu
		{
			id: "ty.ctx.align.time",
			label: "Time",
			menu: [
				{ id: `${CTX_MENU_IDS.alignActionPrefix}align-start`, label: "Start" },
				{ id: `${CTX_MENU_IDS.alignActionPrefix}align-end`, label: "End" },
				{
					id: `${CTX_MENU_IDS.alignActionPrefix}align-duration`,
					label: "Duration",
				},
				sep(),
				{
					id: `${CTX_MENU_IDS.alignActionPrefix}distribute-start`,
					label: "Distribute Start",
				},
				{
					id: `${CTX_MENU_IDS.alignActionPrefix}distribute-end`,
					label: "Distribute End",
				},
			],
		},
		sep(),
		// Target selection (exclusive)
		{
			id: CTX_MENU_IDS.alignTargetSelection,
			label: "Selection",
			checkable: true,
			checked: currentTarget === "selection",
		},
		{
			id: CTX_MENU_IDS.alignTargetComp,
			label: "Comp",
			checkable: true,
			checked: currentTarget === "comp",
		},
		{
			id: CTX_MENU_IDS.alignTargetKeyObject,
			label: "Key Object",
			checkable: true,
			checked: currentTarget === "key-object",
		},
		{
			id: CTX_MENU_IDS.alignTargetTime,
			label: "Time",
			checkable: true,
			checked: currentTarget === "time",
		},
	];
}

function buildAnchorPointContextMenu(currentPosition: string): CepMenuEntry[] {
	return [
		{
			id: CTX_MENU_IDS.anchorPointResetCenter,
			label: "Reset to Center",
		},
		sep(),
		{
			id: CTX_MENU_IDS.anchorPointApplyAllLayers,
			label: "Apply to All Selected Layers",
		},
		{
			id: CTX_MENU_IDS.anchorPointApplyActiveComp,
			label: "Apply to Active Composition",
		},
		sep(),
		{
			id: "ty.ctx.anchor-point.positions",
			label: "Position",
			menu: [
				{
					id: `${CTX_MENU_IDS.anchorPointPrefix}top-left`,
					label: "Top Left",
					checkable: true,
					checked: currentPosition === "top-left",
				},
				{
					id: `${CTX_MENU_IDS.anchorPointPrefix}top-center`,
					label: "Top Center",
					checkable: true,
					checked: currentPosition === "top-center",
				},
				{
					id: `${CTX_MENU_IDS.anchorPointPrefix}top-right`,
					label: "Top Right",
					checkable: true,
					checked: currentPosition === "top-right",
				},
				{
					id: `${CTX_MENU_IDS.anchorPointPrefix}center-left`,
					label: "Center Left",
					checkable: true,
					checked: currentPosition === "center-left",
				},
				{
					id: `${CTX_MENU_IDS.anchorPointPrefix}center`,
					label: "Center",
					checkable: true,
					checked: currentPosition === "center",
				},
				{
					id: `${CTX_MENU_IDS.anchorPointPrefix}center-right`,
					label: "Center Right",
					checkable: true,
					checked: currentPosition === "center-right",
				},
				{
					id: `${CTX_MENU_IDS.anchorPointPrefix}bottom-left`,
					label: "Bottom Left",
					checkable: true,
					checked: currentPosition === "bottom-left",
				},
				{
					id: `${CTX_MENU_IDS.anchorPointPrefix}bottom-center`,
					label: "Bottom Center",
					checkable: true,
					checked: currentPosition === "bottom-center",
				},
				{
					id: `${CTX_MENU_IDS.anchorPointPrefix}bottom-right`,
					label: "Bottom Right",
					checkable: true,
					checked: currentPosition === "bottom-right",
				},
			],
		},
	];
}

function buildFontViewerContextMenu(): CepMenuEntry[] {
	const aspect = readFontViewerTileAspect();
	return [
		{
			id: CTX_MENU_IDS.fontViewerTileSquare,
			label: "Tile aspect 1:1",
			checkable: true,
			checked: aspect === "square",
		},
		{
			id: CTX_MENU_IDS.fontViewerTileWide,
			label: "Tile aspect 16:9",
			checkable: true,
			checked: aspect === "wide",
		},
		sep(),
		{
			id: CTX_MENU_IDS.fontViewerToggleResolved,
			label: "Toggle resolved-font match column",
		},
	];
}

export function buildEasingContextMenu(): CepMenuEntry[] {
	return [
		{
			id: CTX_MENU_IDS.easingApplyCurrent,
			label: "Apply",
		},
		{
			id: CTX_MENU_IDS.easingCopyFromSelection,
			label: "Copy from selection",
		},
		{
			id: CTX_MENU_IDS.easingReverseCurve,
			label: "Reverse / Convert to Curve",
		},
		{
			id: "ty.ctx.easing.copyPaste",
			label: "Clipboard",
			menu: [
				{
					id: CTX_MENU_IDS.easingCopyEase,
					label: "Copy Ease",
					enabled: easingClipboardCache !== null,
				},
				{
					id: CTX_MENU_IDS.easingCopyValues,
					label: "Copy Values",
					// Always enabled: you can always copy the current
					// selection's values to the clipboard.
					enabled: true,
				},
				sep(),
				{
					id: CTX_MENU_IDS.easingPaste,
					label: "Paste",
					enabled:
						easingClipboardCache !== null || valuesClipboardCache !== null,
				},
			],
		},
		sep(),
		{
			id: "ty.ctx.easing.presets",
			label: "Preset",
			menu: [
				{
					id: CTX_MENU_IDS.easingPresetLinear,
					label: "Linear",
				},
				{
					id: CTX_MENU_IDS.easingPresetEaseOut,
					label: "Ease Out",
				},
				{
					id: CTX_MENU_IDS.easingPresetEaseIn,
					label: "Ease In",
				},
				{
					id: CTX_MENU_IDS.easingPresetEaseInOut,
					label: "Ease In Out",
				},
			],
		},
		sep(),
		{
			id: "ty.ctx.easing.background",
			label: "Background",
			menu: [
				{
					id: CTX_MENU_IDS.easingBackgroundDot,
					label: "Dots",
					checkable: true,
					checked: readEasingBackground() === "dot",
				},
				{
					id: CTX_MENU_IDS.easingBackgroundGrid,
					label: "Grid",
					checkable: true,
					checked: readEasingBackground() === "grid",
				},
			],
		},
		{
			id: "ty.ctx.easing.applyMode",
			label: "Apply Mode",
			menu: [
				{
					id: CTX_MENU_IDS.easingApplyModeSingle,
					label: "Single",
					checkable: true,
					checked: readEasingApplyMode() === "single",
				},
				{
					id: CTX_MENU_IDS.easingApplyModePair,
					label: "Each Segment",
					checkable: true,
					checked: readEasingApplyMode() === "pair",
				},
			],
		},
		{
			id: "ty.ctx.easing.autoApply",
			label: "Auto Apply",
			menu: [
				{
					id: CTX_MENU_IDS.easingAutoApplyOn,
					label: "On",
					checkable: true,
					checked: readEasingAutoApply(),
				},
				{
					id: CTX_MENU_IDS.easingAutoApplyOff,
					label: "Off",
					checkable: true,
					checked: !readEasingAutoApply(),
				},
			],
		},
		{
			id: "ty.ctx.easing.labels",
			label: "Label Color",
			menu: buildEasingLabelColorMenu(
				easingCustomColorsCache,
				easingLabelColorNamesCache,
			),
		},
		{
			id: "ty.ctx.easing.mainLabelColor",
			label: "Apply Color",
			menu: buildEasingMainLabelColorMenu(
				easingMainLabelColorCache,
				easingLabelColorNamesCache,
			),
		},
		{
			id: "ty.ctx.easing.shortcuts",
			label: "Shortcuts",
			menu: [
				{
					id: "_shortcut.drag",
					label: "Drag: move point/handle",
					enabled: false,
				},
				{
					id: "_shortcut.shift",
					label: "Shift+Drag: constrain to axis",
					enabled: false,
				},
				{
					id: "_shortcut.alt",
					label: "Alt+Drag: independent handles",
					enabled: false,
				},
				{
					id: "_shortcut.mirror",
					label: "Ctrl+Alt+Drag: mirror handles",
					enabled: false,
				},
				{
					id: "_shortcut.add",
					label: "Ctrl+Click: add/remove point",
					enabled: false,
				},
				{
					id: "_shortcut.pull",
					label: "Alt+Click: pull out handle",
					enabled: false,
				},
				{
					id: "_shortcut.pan",
					label: "Space+Drag / Middle: pan",
					enabled: false,
				},
				{
					id: "_shortcut.reset",
					label: "Double-click empty: reset",
					enabled: false,
				},
			],
		},
	];
}

/** Archive empty grid / status bar equivalent (index.tsx onContextMenu base) */
function buildWorkspaceRootMenu(
	state: Pick<
		SurfaceState,
		| "layoutLocked"
		| "panelId"
		| "surfaceTiles"
		| "selectedSurfaceIndices"
		| "presetSelectedIds"
		| "presets"
		| "panelPresetIds"
	>,
	includeCep: boolean,
	snapshots: readonly Snapshot[] = [],
): CepMenuEntry[] {
	const rows: CepMenuEntry[] = [];
	const sel = catalogPresetIdsForWorkspaceBulk(state);
	const multi = sel.length > 1;

	rows.push({
		id: CTX_MENU_IDS.undo,
		label: "Undo",
		enabled: includeCep,
	});
	rows.push({
		id: CTX_MENU_IDS.redo,
		label: "Redo",
		enabled: includeCep,
	});
	rows.push(sep());

	if (multi && includeCep) {
		rows.push({
			id: CTX_MENU_IDS.groupSelectedPresets,
			label: "Group Selected Items",
		});
		const mv = movePresetsToPanelSubmenu(
			state.panelId,
			includeCep,
			CTX_MENU_IDS.moveSelectedToPanelMenuRoot,
		);
		if (mv) rows.push(mv);
		rows.push({
			id: CTX_MENU_IDS.deleteSelectedPresets,
			label: `Delete ${sel.length} Presets`,
		});
		rows.push(sep());
	}

	rows.push(
		layoutArchiveSubmenuEntry(state.layoutLocked, includeCep, snapshots),
	);
	rows.push(sep());
	rows.push({
		id: CTX_MENU_IDS.addWidget,
		label: "Add Widget",
		enabled: includeCep,
	});
	rows.push(createPresetsArchiveEntry(includeCep));
	return rows;
}

/** Preset row: same structure as archive onPresetContextMenu (no duplicate/id-copy/common-tools columns) */
function buildPresetRowMenu(
	hit: { presetId: string },
	state: Pick<
		SurfaceState,
		| "panelId"
		| "presets"
		| "surfaceTiles"
		| "selectedSurfaceIndices"
		| "presetSelectedIds"
		| "panelPresetIds"
		| "openedGroupPresetId"
		| "groupCatalogEntries"
	>,
	includeCep: boolean,
): CepMenuEntry[] {
	const pid = hit.presetId.trim();
	const hasId = Boolean(pid);
	const preset = findPreset(state.presets, pid);
	const groupCatalogHit = state.groupCatalogEntries.some(
		(g) => g.id.trim() === pid,
	);
	const delDisabled = preset === undefined && !groupCatalogHit;
	const sel = catalogPresetIdsForWorkspaceBulk(state);
	const multi = sel.length > 1;
	const openedGroup = state.groupCatalogEntries.find(
		(group) => group.id.trim() === (state.openedGroupPresetId?.trim() ?? ""),
	);
	const openedGroupMembers = openedGroup ? openedGroup.presetIds : [];
	const isMemberOfOpenedGroup =
		openedGroup !== null &&
		openedGroup !== undefined &&
		pid.length > 0 &&
		pid !== openedGroup.id &&
		openedGroupMembers.includes(pid);
	const isGroupPresetRow = groupCatalogHit;

	const rows: CepMenuEntry[] = [];
	if (multi && includeCep) {
		rows.push({
			id: CTX_MENU_IDS.groupSelectedPresets,
			label: "Group Selected Items",
		});
		rows.push(sep());
	}

	rows.push({
		id: CTX_MENU_IDS.runPreset,
		label: "Run",
		enabled: hasId,
	});
	rows.push({
		id: CTX_MENU_IDS.editPreset,
		label: "Edit",
		enabled: hasId && includeCep,
	});
	rows.push({
		id: CTX_MENU_IDS.duplicatePreset,
		label: "Duplicate",
		enabled: hasId && includeCep && preset !== undefined,
	});
	const moveSub = movePresetsToPanelSubmenu(
		state.panelId,
		includeCep,
		CTX_MENU_IDS.movePresetToPanelMenuRoot,
	);
	if (moveSub) rows.push(moveSub);
	rows.push(sep());
	rows.push({
		id: CTX_MENU_IDS.deletePreset,
		label: "Delete",
		enabled: hasId && includeCep && !delDisabled,
	});
	if (isGroupPresetRow && includeCep) {
		rows.push({
			id: CTX_MENU_IDS.releaseGroupPreset,
			label: "Release Group",
			enabled: hasId,
		});
	}
	if (isMemberOfOpenedGroup && includeCep) {
		rows.push({
			id: CTX_MENU_IDS.removePresetFromOpenedGroup,
			label: "Remove from This Group",
			enabled: hasId,
		});
	}
	return rows;
}

/**
 * Context menu for a **group tile** in the workspace grid (not a preset row).
 * Shows Open, Edit, Release Group, and Delete.
 */
function buildGroupTileMenu(
	tileId: string,
	state: Pick<
		SurfaceState,
		| "panelId"
		| "presets"
		| "surfaceTiles"
		| "selectedSurfaceIndices"
		| "presetSelectedIds"
		| "panelPresetIds"
		| "openedGroupPresetId"
		| "groupCatalogEntries"
	>,
	includeCep: boolean,
): CepMenuEntry[] {
	const tid = tileId.trim();
	const hasId = Boolean(tid);
	const groupCatalogHit = state.groupCatalogEntries.some(
		(g) => g.id.trim() === tid,
	);
	const rows: CepMenuEntry[] = [];

	rows.push({
		id: CTX_MENU_IDS.runPreset,
		label: "Open",
		enabled: hasId,
	});
	rows.push({
		id: CTX_MENU_IDS.editPreset,
		label: "Edit",
		enabled: hasId && includeCep,
	});
	const moveSub = movePresetsToPanelSubmenu(
		state.panelId,
		includeCep,
		CTX_MENU_IDS.movePresetToPanelMenuRoot,
	);
	if (moveSub) rows.push(moveSub);
	rows.push(sep());
	rows.push({
		id: CTX_MENU_IDS.deletePreset,
		label: "Delete",
		enabled: hasId && includeCep && groupCatalogHit,
	});
	if (groupCatalogHit && includeCep) {
		rows.push({
			id: CTX_MENU_IDS.releaseGroupPreset,
			label: "Release Group",
			enabled: hasId,
		});
	}
	return rows;
}

/**
 * Context menu for a **workspace grid** widget placement (Move / Delete and widget-type extras).
 * `placementSurfaceIndex` is `hit.id` from `{ zone: "workspace-placement" }`.
 */
function buildWorkspacePlacementBaseMenu(
	wid: string,
	state: Pick<SurfaceState, "layoutLocked" | "panelId">,
	opts: { isCep: boolean },
): CepMenuEntry[] {
	const rows: CepMenuEntry[] = [];
	let moveSub = movePresetsToPanelSubmenu(
		state.panelId,
		opts.isCep,
		CTX_MENU_IDS.moveWidgetToPanelMenuRoot,
	);
	if (moveSub && state.layoutLocked) {
		moveSub = withMoveSubmenuDisabled(moveSub);
	}
	if (moveSub) rows.push(moveSub);
	rows.push(sep());
	rows.push({
		id: CTX_MENU_IDS.deleteWorkspaceWidget,
		label: "Delete",
		enabled: opts.isCep && wid.trim().length > 0,
	});
	return rows;
}

function buildWorkspacePlacementWidgetMenu(
	placementSurfaceIndex: string,
	state: Pick<
		SurfaceState,
		| "layoutLocked"
		| "panelId"
		| "surfaceTiles"
		| "selectedSurfaceIndices"
		| "presetSelectedIds"
		| "presetHoverId"
		| "presets"
		| "panelPresetIds"
		| "widgetInstanceTypes"
		| "groupCatalogEntries"
	>,
	opts: {
		isCep: boolean;
		hostCode: string;
		getSavedSnapshots?: () => Snapshot[];
	},
): CepMenuEntry[] {
	const wid = logicalTileIdForWidgetMenuHit(placementSurfaceIndex, state);
	if (wid === "widget-menu") {
		const rows: CepMenuEntry[] = [
			...buildWorkspaceRootMenu(
				state,
				opts.isCep,
				opts.getSavedSnapshots?.() ?? [],
			),
			sep(),
			{
				id: CTX_MENU_IDS.openPresets,
				label: "Presets",
				enabled: opts.isCep,
			},
			{
				id: CTX_MENU_IDS.openPresetLibrary,
				label: "Preset Library",
				enabled: opts.isCep,
			},
			{
				id: CTX_MENU_IDS.openMessages,
				label: "Messages",
				enabled: opts.isCep,
			},
			{
				id: CTX_MENU_IDS.openSettings,
				label: "Settings",
				enabled: opts.isCep,
			},
			{
				id: CTX_MENU_IDS.openDebug,
				label: "Debug Console",
			},
		];
		return rows;
	}

	const specificRows: CepMenuEntry[] = [];

	if (wid === "widget-layout-lock") {
		specificRows.push({
			id: CTX_MENU_IDS.toggleLayoutLock,
			label: state.layoutLocked ? "Unlock Layout" : "Lock Layout",
			checkable: true,
			checked: state.layoutLocked,
		});
		specificRows.push(sep());
	}

	if (wid === "widget-project-info" && opts.hostCode === "AEFT") {
		specificRows.push({
			id: CTX_MENU_IDS.refreshProjectInfo,
			label: "Update Comp Info",
		});
		specificRows.push(sep());
	}

	const widgetType = state.widgetInstanceTypes[wid]?.trim();
	if (widgetType === "info" || wid === "widget-info") {
		// For info widget, Edit is always enabled when in CEP mode
		specificRows.push({
			id: CTX_MENU_IDS.editPreset,
			label: "Edit",
			enabled: opts.isCep,
		});
		specificRows.push(sep());
	}
	if (widgetType === "easing" || wid === "widget-easing") {
		specificRows.push(...buildEasingContextMenu(), sep());
	}
	if (widgetType === "fonts" || widgetType === "font") {
		specificRows.push(...buildFontViewerContextMenu(), sep());
	}
	if (widgetType === "align" || wid === "widget-align") {
		specificRows.push(...buildAlignContextMenu(readAlignTarget()), sep());
	}
	return [
		...specificRows,
		...buildWorkspacePlacementBaseMenu(wid, state, opts),
	];
}

/** Same shape for both tests and builds */
export function buildWorkspaceContextMenuPayload(
	hit: ContextHit,
	state: Pick<
		SurfaceState,
		| "layoutLocked"
		| "presets"
		| "surfaceTiles"
		| "selectedSurfaceIndices"
		| "presetSelectedIds"
		| "presetHoverId"
		| "panelPresetIds"
		| "panelId"
		| "openedGroupPresetId"
		| "groupCatalogEntries"
		| "widgetInstanceTypes"
	>,
	_caps: MenuCaps,
	opts: {
		isCep: boolean;
		hostCode: string;
		getSavedSnapshots?: () => Snapshot[];
	},
): CepMenuPayload {
	void _caps;
	if (hit.zone === "outside" || hit.zone === "control-panel") {
		return { menu: [] };
	}

	const includeCep = opts.isCep;
	const snapshots = opts.getSavedSnapshots?.() ?? [];

	if (hit.zone === "ctx-probe") {
		return {
			menu: [
				{
					id: CTX_MENU_IDS.probeLog,
					label: "Test: Log to Console",
				},
				sep(),
				{
					id: CTX_MENU_IDS.probeOpenDebug,
					label: "Test: Open Debug Console",
					enabled: includeCep,
				},
			],
		};
	}

	if (hit.zone === "qa-cat") {
		const cat = hit.qaCat;
		if (!(QA_ORDER as readonly string[]).includes(cat)) {
			return { menu: [] };
		}
		// quickActionCategories is now widget-instance state; default to empty (all collapsed)
		const set = new Set<string>();
		const visible = set.has(cat);
		return {
			menu: [
				{
					id: CTX_MENU_IDS.qaToggle,
					label: visible ? `Hide Category "${cat}"` : `Show Category "${cat}"`,
				},
			],
		};
	}

	if (hit.zone === "preset-row") {
		return { menu: buildPresetRowMenu(hit, state, includeCep) };
	}

	if (
		hit.zone === "directory-browser" &&
		hit.entryKind === "preset" &&
		hit.presetId
	) {
		return {
			menu: buildPresetRowMenu({ presetId: hit.presetId }, state, includeCep),
		};
	}

	if (hit.zone === "anchor-point") {
		return {
			menu: buildAnchorPointContextMenu(hit.anchorPosition),
		};
	}

	if (hit.zone === "workspace-placement") {
		const idx = Number.parseInt(hit.id.trim(), 10);
		const t =
			Number.isFinite(idx) && idx >= 0 ? state.surfaceTiles[idx] : undefined;
		if (!t) {
			return { menu: buildWorkspaceRootMenu(state, includeCep, snapshots) };
		}
		const tid = t.id.trim();
		if (tileIdResolvesAsWidget(state, tid)) {
			return {
				menu: buildWorkspacePlacementWidgetMenu(hit.id.trim(), state, opts),
			};
		}
		// Group tiles in workspace grid → group tile menu (Open, Edit, Release Group, Delete)
		const isGroup = state.groupCatalogEntries.some((g) => g.id.trim() === tid);
		if (isGroup) {
			return { menu: buildGroupTileMenu(tid, state, includeCep) };
		}
		return {
			menu: buildPresetRowMenu({ presetId: tid }, state, includeCep),
		};
	}

	return {
		menu: buildWorkspaceRootMenu(state, includeCep, snapshots),
	};
}

/** `.ty-control-panel` right-click (same items as legacy DOM `showCpMenu`) */
function buildControlPanelContextMenuPayload(): CepMenuPayload {
	return {
		menu: [
			{
				id: CTX_MENU_IDS.cpToggleCollapse,
				label: "Collapse/Expand",
			},
			sep(),
			{
				id: "ty.ctx.cp.group.position",
				label: "Position",
				menu: [
					{ id: CTX_MENU_IDS.cpLayoutTopLeft, label: "Top-Left" },
					{ id: CTX_MENU_IDS.cpLayoutTopCenter, label: "Top-Center" },
					{ id: CTX_MENU_IDS.cpLayoutTopRight, label: "Top-Right" },
					{ id: CTX_MENU_IDS.cpLayoutBottomLeft, label: "Bottom-Left" },
					{ id: CTX_MENU_IDS.cpLayoutBottomCenter, label: "Bottom-Center" },
					{ id: CTX_MENU_IDS.cpLayoutBottomRight, label: "Bottom-Right" },
					{ id: CTX_MENU_IDS.cpLayoutLeftCenter, label: "Left-Center" },
					{ id: CTX_MENU_IDS.cpLayoutRightCenter, label: "Right-Center" },
				],
			},
			{
				id: "ty.ctx.cp.group.orientation",
				label: "Orientation",
				menu: [
					{ id: CTX_MENU_IDS.cpOrientHorizontal, label: "Horizontal" },
					{ id: CTX_MENU_IDS.cpOrientVertical, label: "Vertical" },
				],
			},
			sep(),
			{
				id: CTX_MENU_IDS.cpResetDefault,
				label: "Reset to Default",
			},
			sep(),
			{
				id: CTX_MENU_IDS.addWidget,
				label: "Add Widget",
			},
		],
	};
}

/** Prefix for heading row IDs to ignore in CEP callbacks */
export const CEP_CONTEXT_HEADER_ID_PREFIX = "ty.ctx.h.";

/**
 * Sanitize for `setContextMenuByJSON`.
 * - Headings (no id) get a dummy id as disabled rows (items without id are hidden in CEP).
 * - Keys like `heading` that the host does not interpret are omitted from output.
 */
function appendCepMenuJsonItem(
	menu: Array<Record<string, unknown>>,
	raw: CepMenuEntry,
	headingSec: { v: number },
): void {
	if (raw.label === "---") {
		menu.push({ label: "---" });
		return;
	}
	if (raw.heading) {
		menu.push({
			id: `${CEP_CONTEXT_HEADER_ID_PREFIX}s${headingSec.v++}`,
			label: raw.label,
			enabled: false,
		});
		return;
	}
	if (!raw.id) return;
	const o: Record<string, unknown> = {
		id: raw.id,
		label: raw.label,
	};
	if (raw.enabled === false) {
		o.enabled = false;
	}
	if (raw.checkable === true) {
		o.checkable = true;
		o.checked = Boolean(raw.checked);
	}
	if (raw.menu && raw.menu.length > 0) {
		const nested: Array<Record<string, unknown>> = [];
		for (const child of raw.menu) {
			appendCepMenuJsonItem(nested, child, headingSec);
		}
		o.menu = nested;
	}
	menu.push(o);
}

function menuPayloadToCepJsonString(payload: CepMenuPayload): string {
	const headingSec = { v: 0 };
	const menu: Array<Record<string, unknown>> = [];
	for (const raw of payload.menu) {
		appendCepMenuJsonItem(menu, raw, headingSec);
	}
	return JSON.stringify({ menu });
}

function escapeXmlAttr(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function appendCepMenuItemXml(
	parts: string[],
	raw: CepMenuEntry,
	headingSec: { v: number },
): void {
	if (raw.label === "---") {
		parts.push('<MenuItem Label="---" />');
		return;
	}
	if (raw.heading) {
		const id = `${CEP_CONTEXT_HEADER_ID_PREFIX}s${headingSec.v++}`;
		parts.push(
			`<MenuItem Id="${escapeXmlAttr(id)}" Label="${escapeXmlAttr(raw.label)}" Enabled="false" Checked="false"/>`,
		);
		return;
	}
	if (!raw.id) return;
	const en = raw.enabled !== false;
	const checkable = raw.checkable === true;
	const checked = raw.checked === true;
	const subs = raw.menu && raw.menu.length > 0 ? raw.menu : null;
	const attrs = `Id="${escapeXmlAttr(raw.id)}" Label="${escapeXmlAttr(raw.label)}" Enabled="${en}"`;
	const tail = checkable
		? ` Checkable="true" Checked="${checked ? "true" : "false"}"`
		: ` Checked="false"`;
	if (subs) {
		parts.push(`<MenuItem ${attrs}${tail}>`);
		for (const sub of subs) {
			appendCepMenuItemXml(parts, sub, headingSec);
		}
		parts.push("</MenuItem>");
	} else {
		parts.push(`<MenuItem ${attrs}${tail}/>`);
	}
}

/**
 * XML for `CSInterface#setContextMenu` (CEP 5.2+).
 * `setPanelContextMenu` from `docs/examples/research-cep-menu.md` is now this API name in current CSInterface.
 */
function menuPayloadToCepXmlString(payload: CepMenuPayload): string {
	const parts: string[] = ["<Menu>"];
	const headingSec = { v: 0 };
	for (const raw of payload.menu) {
		appendCepMenuItemXml(parts, raw, headingSec);
	}
	parts.push("</Menu>");
	return parts.join("");
}

/** Receive menu selection via `csInterface.addEventListener` (research-cep-menu.md style) */
const CEP_CONTEXTMENU_CLICKED = "com.adobe.cep.contextmenu.clicked";

/** Legacy alias sometimes used by CSXS-family hosts */
const CEP_CONTEXTMENU_CLICKED_CSXS = "com.adobe.csxs.events.contextMenuClicked";

function contextMenuPickFromCepEvent(event: unknown): string | null {
	const e = event as {
		data?: unknown;
		menuId?: unknown;
		dataObj?: { menuItemId?: unknown };
	};
	if (typeof e?.data === "string") return e.data;
	if (typeof e?.menuId === "string") return e.menuId;
	const mid = e?.dataObj?.menuItemId;
	if (typeof mid === "string") return mid;
	return null;
}

type CsWithCtx = {
	setContextMenu?: (menu: string, cb: (menuId: string | null) => void) => void;
	setContextMenuByJSON?: (
		menu: string,
		cb: (menuId: string | null) => void,
	) => void;
	addEventListener?: (
		type: string,
		listener: (event: unknown) => void,
		obj?: unknown,
	) => void;
	removeEventListener?: (
		type: string,
		listener: (event: unknown) => void,
		obj?: unknown,
	) => void;
};

function isCepContextMenuApiAvailable(win: Window): boolean {
	const cep = (win as unknown as { __adobe_cep__?: { invokeAsync?: unknown } })
		.__adobe_cep__;
	return typeof cep?.invokeAsync === "function";
}

export type AttachUnifiedCtxOptions = {
	root: Element;
	getState: () => SurfaceState;
	getCaps: () => MenuCaps;
	hostCode: string;
	isCep: boolean;
	/** For test replacement. Defaults to `window.CSInterface` when unspecified. */
	getCsInterface?: () => CsWithCtx | null;
	beforeOpenMenu: () => void;
	onSelect: (id: string, hit: ContextHit) => void;
	/** Current saved snapshots, used to populate the "Saved Layouts" submenu. */
	getSavedSnapshots?: () => Snapshot[];
};

/**
 * Some hosts (e.g. Motion Tools Pro) require a context API call immediately
 * at startup before right-click works. We prime with an **empty** menu so
 * the API gets armed but no non-functional "Ty Plus" header leaks into the
 * default right-click before any payload is set.
 */
const CEP_CTX_PRIME_XML = `<Menu></Menu>`;

const CEP_CTX_PRIME_JSON = JSON.stringify({ menu: [] });

export type UnifiedWorkspaceContextMenuAttachment = {
	detach: () => void;
	/** Same pipeline as right-click (`setContextMenu`). */
	presentContextMenuAt: (ev: MouseEvent, target: EventTarget | null) => void;
};

export function attachUnifiedWorkspaceContextMenu(
	opts: AttachUnifiedCtxOptions,
): UnifiedWorkspaceContextMenuAttachment {
	let lastHit: ContextHit = { zone: "workspace" };

	const resolveCs = (): CsWithCtx | null => {
		if (opts.getCsInterface) {
			return opts.getCsInterface();
		}
		try {
			const Ctor = (window as unknown as { CSInterface?: new () => CsWithCtx })
				.CSInterface;
			return Ctor ? new Ctor() : null;
		} catch {
			return null;
		}
	};

	/** First registration (same category as extensions that re-register on login state change) */
	const primeCepContextMenuIfNeeded = (): void => {
		if (!isCepContextMenuApiAvailable(window)) {
			return;
		}
		const cs = resolveCs();
		if (!cs) return;
		try {
			if (typeof cs.setContextMenu === "function") {
				cs.setContextMenu(CEP_CTX_PRIME_XML, () => {});
			} else if (typeof cs.setContextMenuByJSON === "function") {
				cs.setContextMenuByJSON(CEP_CTX_PRIME_JSON, () => {});
			}
		} catch {
			/* Retry on next right-click if timing was not yet initialized */
		}
	};
	queueMicrotask(() => {
		primeCepContextMenuIfNeeded();
	});

	let pickDedup: { id: string; t: number } = { id: "", t: 0 };
	const forwardCepMenuPick = (menuId: string | null): void => {
		if (menuId == null || menuId === "") return;
		if (menuId.startsWith(CEP_CONTEXT_HEADER_ID_PREFIX)) return;
		const now = Date.now();
		if (pickDedup.id === menuId && now - pickDedup.t < 200) return;
		pickDedup = { id: menuId, t: now };
		opts.onSelect(menuId, lastHit);
	};

	const onCepContextMenuClicked = (event: unknown): void => {
		forwardCepMenuPick(contextMenuPickFromCepEvent(event));
	};

	let csForCepClick: CsWithCtx | null = null;
	if (isCepContextMenuApiAvailable(window)) {
		csForCepClick = resolveCs();
		if (typeof csForCepClick?.addEventListener === "function") {
			csForCepClick.addEventListener(
				CEP_CONTEXTMENU_CLICKED,
				onCepContextMenuClicked,
			);
			csForCepClick.addEventListener(
				CEP_CONTEXTMENU_CLICKED_CSXS,
				onCepContextMenuClicked,
			);
		}
	}

	const presentContextMenuAt = (
		ev: MouseEvent,
		target: EventTarget | null,
	): void => {
		// Capture the modifier keys at open time so the paste dispatch in
		// workspace/hook.ts can read them when the CEP menu click fires
		// (the click event from CEP does not include modifier state).
		(
			window as unknown as {
				__lastCtxMods?: { altKey: boolean; shiftKey: boolean };
			}
		).__lastCtxMods = {
			altKey: ev.altKey ?? false,
			shiftKey: ev.shiftKey ?? false,
		};
		const el = contextMenuTargetElement(target);
		if (!el || !opts.root.contains(el)) return;

		let hit = resolveContextHit(opts.root, target);
		hit = applyFlatWorkspaceHit(hit, readFlatWorkspaceContextMenu());

		if (hit.zone === "outside") return;

		if (hit.zone === "control-panel") {
			if (readSkipUnifiedContextMenu()) {
				return;
			}
			lastHit = hit;
			opts.beforeOpenMenu();
			const cpPayload = buildControlPanelContextMenuPayload();
			if (isCepContextMenuApiAvailable(window)) {
				const cs = resolveCs();
				const cpXml = menuPayloadToCepXmlString(cpPayload);
				if (cs && typeof cs.setContextMenu === "function" && cpXml.length > 0) {
					cs.setContextMenu(cpXml, (menuId) => {
						forwardCepMenuPick(menuId);
					});
					return;
				}
				const cpJson = menuPayloadToCepJsonString(cpPayload);
				if (
					cs &&
					typeof cs.setContextMenuByJSON === "function" &&
					cpJson.length > 0
				) {
					cs.setContextMenuByJSON(cpJson, (menuId) => {
						forwardCepMenuPick(menuId);
					});
					return;
				}
			}
			return;
		}

		if (readSkipUnifiedContextMenu()) {
			return;
		}

		if (isNativeTextEditTarget(ev.target)) {
			return;
		}

		const payload = buildWorkspaceContextMenuPayload(
			hit,
			opts.getState(),
			opts.getCaps(),
			{
				isCep: opts.isCep,
				hostCode: opts.hostCode,
				getSavedSnapshots: opts.getSavedSnapshots,
			},
		);
		if (payload.menu.length === 0) {
			return;
		}

		lastHit = hit;
		opts.beforeOpenMenu();

		if (isCepContextMenuApiAvailable(window)) {
			const cs = resolveCs();
			const xml = menuPayloadToCepXmlString(payload);
			if (cs && typeof cs.setContextMenu === "function" && xml.length > 0) {
				cs.setContextMenu(xml, (menuId) => {
					forwardCepMenuPick(menuId);
				});
				return;
			}
			const json = menuPayloadToCepJsonString(payload);
			if (
				cs &&
				typeof cs.setContextMenuByJSON === "function" &&
				json.length > 0
			) {
				cs.setContextMenuByJSON(json, (menuId) => {
					forwardCepMenuPick(menuId);
				});
				return;
			}
		}
	};

	const onContextMenu = (ev: MouseEvent): void => {
		presentContextMenuAt(ev, ev.target);
	};

	/* research-cep-menu.md: window + bubble. CEP just calls setContextMenu here (do not preventDefault) */
	const onMouseDown = (ev: MouseEvent): void => {
		if (ev.button !== 2) return;
		if (!isCepContextMenuApiAvailable(window)) return;
		onContextMenu(ev);
	};
	window.addEventListener("mousedown", onMouseDown, true);
	window.addEventListener("contextmenu", onContextMenu, false);
	return {
		presentContextMenuAt,
		detach: () => {
			if (typeof csForCepClick?.removeEventListener === "function") {
				csForCepClick.removeEventListener(
					CEP_CONTEXTMENU_CLICKED,
					onCepContextMenuClicked,
				);
				csForCepClick.removeEventListener(
					CEP_CONTEXTMENU_CLICKED_CSXS,
					onCepContextMenuClicked,
				);
			}
			window.removeEventListener("mousedown", onMouseDown, true);
			window.removeEventListener("contextmenu", onContextMenu, false);
		},
	};
}

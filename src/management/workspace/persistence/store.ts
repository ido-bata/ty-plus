import type { WidgetType } from "@/function/widget/contract";
import { isWidgetType } from "@/function/widget/contract";
import {
	readGroupJson,
	readPresetJson,
	readWidgetJson,
	writeGroupJson,
	writePresetJson,
	writeWidgetJson,
} from "@/management/catalog/json-files";
import type {
	CpOrientation,
	CpPersistedState,
	CpPosition,
} from "@/management/panel/control/types";
import { resolveStylesThemeCssPath } from "@/management/storage/file";
import { stripKnownIdPrefixes } from "@/management/storage/ids";
import {
	readJsonText,
	resolveReadManagedRoot,
	resolveWriteManagedRoot,
	writeJson,
} from "@/management/storage/persistence";
import {
	readJsonFileText,
	readJsonFileTextStrict,
} from "@/management/storage/read/json-file";
import { writeJsonFileText } from "@/management/storage/write/json-file";
import { parse } from "@/management/workspace/background/parse";
import {
	type Layout,
	type LayoutItem,
	type PersistedLayoutDocument,
	type PresetLayout,
	parseGridCells,
} from "@/management/workspace/layout/grid-document";
import type { SurfaceState } from "@/management/workspace/state";
import { normalizeState } from "@/management/workspace/state/normalize";
import {
	clipSelection,
	indicesFromLegacy,
	layoutsFromSurface,
	tilesFromDocument,
	widgetResolutionFromCatalogContext,
} from "@/management/workspace/surface/tiles";

const WORKSPACE_PANEL_STATE_STORAGE_KEY_PREFIX = "ty-plus-workspace-state-v1:";

type PersistedSurfaceState = Pick<
	SurfaceState,
	| "grid"
	| "surfaceTiles"
	| "selectedSurfaceIndices"
	| "layoutLocked"
	| "presetFocusId"
	| "presetSelectedIds"
	| "presetHoverId"
	| "panelPresetIds"
	| "showGridOverlay"
	| "showPresetLabels"
	| "bg"
>;

type SettingsRoot = {
	core?: {
		supportRoot?: string;
		paths?: {
			supportRoot?: string;
			presetRoot?: string;
			scriptRoot?: string;
			pluginRoot?: string;
			[key: string]: unknown;
		};
		[key: string]: unknown;
	};
	workspace?: {
		workspacePanels?: Record<string, Record<string, unknown>>;
		snapshots?: Record<string, WorkspaceSnapshot[]>;
		[key: string]: unknown;
	};
	controlPanel?: {
		position?: CpPosition;
		orientation?: CpOrientation;
		collapsed?: boolean;
		[key: string]: unknown;
	};
	[key: string]: unknown;
};

const storageKey = (panelId: string): string =>
	`${WORKSPACE_PANEL_STATE_STORAGE_KEY_PREFIX}${panelId}`;

export const normalizeWorkspacePanelSettingsKey = (panelId: string): string => {
	const match = /^panel-(\d+)$/i.exec(panelId.trim());
	if (match) {
		return `panel${match[1]}`;
	}
	return panelId.trim();
};

const pickPersistedSurfaceState = (
	state: SurfaceState,
): PersistedSurfaceState & { widgets: Layout[] } => {
	const widgets = layoutsFromSurface(
		state.surfaceTiles,
		widgetResolutionFromCatalogContext(state),
	);
	return {
		grid: state.grid,
		surfaceTiles: state.surfaceTiles.map((t) => ({ ...t })),
		selectedSurfaceIndices: [...state.selectedSurfaceIndices],
		layoutLocked: state.layoutLocked,
		presetFocusId: state.presetFocusId,
		presetSelectedIds: [...state.presetSelectedIds],
		presetHoverId: state.presetHoverId,
		panelPresetIds: [...state.panelPresetIds],
		showGridOverlay: state.showGridOverlay,
		showPresetLabels: state.showPresetLabels,
		bg: state.bg,
		widgets,
	};
};

const layoutDocFromLegacyWorkspaceFields = (
	legacyWidgets: Layout[] | null,
	legacyPlacements: readonly { placementId: string; presetRefId: string }[],
	legacyPresetLayouts: Record<string, PresetLayout>,
): PersistedLayoutDocument => {
	const gridCells: LayoutItem[] = [];

	if (legacyWidgets) {
		for (const w of legacyWidgets) {
			const id = stripKnownIdPrefixes(String(w.id ?? w.widgetId ?? "").trim());
			if (!id) continue;
			gridCells.push({
				id,
				x: Math.max(0, Math.round(Number(w.x) || 0)),
				y: Math.max(0, Math.round(Number(w.y) || 0)),
				width: Math.max(1, Math.round(Number(w.width) || 1)),
				height: Math.max(1, Math.round(Number(w.height) || 1)),
			});
		}
	}

	for (const presetId of Object.keys(legacyPresetLayouts)) {
		const preset = legacyPresetLayouts[presetId];
		if (preset && typeof preset === "object") {
			gridCells.push({
				id: presetId,
				x: Math.max(0, Math.round(Number(preset.x) || 0)),
				y: Math.max(0, Math.round(Number(preset.y) || 0)),
				width: Math.max(1, Math.round(Number(preset.width) || 1)),
				height: Math.max(1, Math.round(Number(preset.height) || 1)),
			});
		} else {
			gridCells.push({ id: presetId, x: 0, y: 0, width: 1, height: 1 });
		}
	}

	return {
		gridCells,
		presetLayoutRoster:
			legacyPlacements.length > 0
				? legacyPlacements.map((p) => ({
						placementId: p.placementId,
						presetRefId: p.presetRefId,
					}))
				: undefined,
	};
};

const widgetRecordLiteFromSurfaceState = (
	state: SurfaceState,
	legacyWidgets: Layout[] | null | undefined,
): { id: string; type: WidgetType }[] => {
	const map = new Map<string, WidgetType>();
	for (const [id, wt] of Object.entries(state.widgetInstanceTypes)) {
		if (typeof wt === "string" && isWidgetType(wt)) {
			map.set(id, wt);
		}
	}
	if (legacyWidgets) {
		for (const w of legacyWidgets) {
			const id = stripKnownIdPrefixes(String(w.id ?? w.widgetId ?? "").trim());
			if (!id) continue;
			const wtRaw = w.widgetType;
			if (typeof wtRaw === "string" && isWidgetType(wtRaw)) {
				map.set(id, wtRaw);
			}
		}
	}
	return [...map.entries()].map(([id, type]) => ({ id, type }));
};

const finalizePersistedSurfaceSelection = (
	merged: SurfaceState,
	parsed: Partial<SurfaceState>,
): SurfaceState => {
	const p = parsed as Record<string, unknown>;
	const legacyParsed = p as {
		selectedWidgetId?: unknown;
		selectedWidgetIds?: unknown;
	};
	const ids = new Set<string>();
	for (const i of merged.selectedSurfaceIndices) {
		const tile = merged.surfaceTiles[i];
		if (!tile) continue;
		ids.add(tile.id);
	}
	if (Array.isArray(p.selectedPlacementIds)) {
		for (const id of p.selectedPlacementIds) {
			if (typeof id === "string" && id.trim()) ids.add(id.trim());
		}
	}
	if (Array.isArray(legacyParsed.selectedWidgetIds)) {
		for (const id of legacyParsed.selectedWidgetIds) {
			if (typeof id === "string" && id.trim()) ids.add(id.trim());
		}
	}
	if (
		typeof legacyParsed.selectedWidgetId === "string" &&
		legacyParsed.selectedWidgetId.trim()
	) {
		ids.add(legacyParsed.selectedWidgetId.trim());
	}
	if (Array.isArray(p.presetSelectedIds)) {
		for (const id of p.presetSelectedIds) {
			if (typeof id === "string" && id.trim()) ids.add(id.trim());
		}
	}
	const allIds = Array.from(ids);
	const widgetSet = new Set(
		layoutsFromSurface(
			merged.surfaceTiles,
			widgetResolutionFromCatalogContext(merged),
		).map((w) => w.id),
	);
	const surfaceIndices = indicesFromLegacy(merged.surfaceTiles, allIds);
	const presetSel = allIds.filter((id) => !widgetSet.has(id));
	return {
		...merged,
		selectedSurfaceIndices: clipSelection(
			surfaceIndices,
			merged.surfaceTiles.length,
		),
		presetSelectedIds: presetSel,
	};
};

const applyPersistedSurfaceState = (
	baseState: SurfaceState,
	parsed: Partial<SurfaceState>,
): SurfaceState => {
	const merged: SurfaceState = {
		...baseState,
		...(parsed.grid ? { grid: parsed.grid } : {}),
		...(typeof parsed.layoutLocked === "boolean"
			? { layoutLocked: parsed.layoutLocked }
			: {}),
		...(typeof parsed.presetFocusId === "string" ||
		parsed.presetFocusId === null
			? { presetFocusId: parsed.presetFocusId ?? null }
			: {}),
		...(Array.isArray(parsed.presetSelectedIds)
			? {
					presetSelectedIds: parsed.presetSelectedIds.filter(
						(value): value is string => typeof value === "string",
					),
				}
			: {}),
		...(typeof parsed.presetHoverId === "string" ||
		parsed.presetHoverId === null
			? { presetHoverId: parsed.presetHoverId ?? null }
			: {}),
		...(Array.isArray(parsed.panelPresetIds)
			? {
					panelPresetIds: parsed.panelPresetIds.filter(
						(value): value is string => typeof value === "string",
					),
				}
			: {}),
		...(typeof parsed.showGridOverlay === "boolean"
			? { showGridOverlay: parsed.showGridOverlay }
			: {}),
		...(typeof parsed.showPresetLabels === "boolean"
			? { showPresetLabels: parsed.showPresetLabels }
			: {}),

		...("bg" in parsed
			? {
					bg: parsed.bg === null ? null : parse(parsed.bg),
				}
			: {}),
	};
	const pRaw = parsed as Record<string, unknown>;
	const legacyWidgets = Array.isArray(pRaw.widgets)
		? (pRaw.widgets as Layout[])
		: null;
	const legacyPresetLayouts =
		pRaw.workspacePresetLayouts &&
		typeof pRaw.workspacePresetLayouts === "object" &&
		!Array.isArray(pRaw.workspacePresetLayouts)
			? (pRaw.workspacePresetLayouts as Record<string, PresetLayout>)
			: {};
	const legacyPlacements = Array.isArray(pRaw.workspacePresetPlacements)
		? (pRaw.workspacePresetPlacements as {
				placementId: string;
				presetRefId: string;
			}[])
		: [];
	let layoutMerged: SurfaceState = merged;
	if (
		Array.isArray(pRaw.surfaceTiles) &&
		(pRaw.surfaceTiles as unknown[]).length > 0
	) {
		const tiles = parseGridCells(pRaw.surfaceTiles);
		layoutMerged = { ...layoutMerged, surfaceTiles: tiles };
	} else if (
		legacyWidgets ||
		legacyPlacements.length > 0 ||
		Object.keys(legacyPresetLayouts).length > 0
	) {
		const layoutDoc = layoutDocFromLegacyWorkspaceFields(
			legacyWidgets,
			legacyPlacements,
			legacyPresetLayouts,
		);
		const widgetRecordLite = widgetRecordLiteFromSurfaceState(
			merged,
			legacyWidgets,
		);
		layoutMerged = {
			...layoutMerged,
			surfaceTiles: tilesFromDocument({
				layout: layoutDoc,
				widgetRecords: widgetRecordLite,
				presets: layoutMerged.presets,
				panelPresetIds: layoutMerged.panelPresetIds,
				implicitlyFillAllPresetsWhenLayoutEmpty:
					layoutMerged.panelId === "panel-1",
			}),
		};
	}
	if (legacyWidgets && legacyWidgets.length > 0) {
		const nextWidgetTypes: Record<string, WidgetType> = {
			...layoutMerged.widgetInstanceTypes,
		};
		for (const w of legacyWidgets) {
			const id = stripKnownIdPrefixes(String(w.id ?? w.widgetId ?? "").trim());
			if (!id) continue;
			const wtRaw = w.widgetType;
			if (typeof wtRaw === "string" && isWidgetType(wtRaw)) {
				nextWidgetTypes[id] = wtRaw;
			}
		}
		layoutMerged = {
			...layoutMerged,
			widgetInstanceTypes: nextWidgetTypes,
		};
	}
	if (Array.isArray(pRaw.selectedSurfaceIndices)) {
		const sel = (pRaw.selectedSurfaceIndices as unknown[])
			.filter((v): v is number => typeof v === "number" && Number.isFinite(v))
			.map((v) => Math.trunc(v));
		layoutMerged = {
			...layoutMerged,
			selectedSurfaceIndices: clipSelection(
				sel,
				layoutMerged.surfaceTiles.length,
			),
		};
	}
	return normalizeState(
		finalizePersistedSurfaceSelection(layoutMerged, parsed),
	);
};

const parseSettingsRoot = (raw: string | null | undefined): SettingsRoot => {
	if (!raw?.trim()) {
		return {};
	}
	try {
		const parsed = JSON.parse(raw) as SettingsRoot;
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			return {};
		}
		return parsed;
	} catch {
		return {};
	}
};

export const readSettings = async (win: Window): Promise<string | null> => {
	return readJsonText(win, "app");
};

export const writeSettings = async (
	win: Window,
	jsonText: string,
): Promise<void> => {
	await writeJson(win, "app", JSON.parse(jsonText) as object);
};

export const readPresetsJson = async (win: Window): Promise<string | null> =>
	readPresetJson(win);

/**
 * Raw text of `presets/presets.json`.
 *
 * `readPresetsJson` round-trips through the parsed object, and the object
 * reader maps a body it cannot parse to `null` — which is exactly what a
 * file that does not exist looks like. A caller that has to tell "the
 * catalog is empty" from "the catalog is broken" reads this instead.
 */
export const readPresetsJsonText = async (
	win: Window,
): Promise<string | null> => readJsonText(win, "presetCatalog");

export const writePresetsJson = async (
	win: Window,
	jsonText: string,
): Promise<void> => writePresetJson(win, jsonText);

const readGroupRecordsJson = async (win: Window): Promise<string | null> =>
	readGroupJson(win);

const writeGroupRecordsJson = async (
	win: Window,
	jsonText: string,
): Promise<void> => writeGroupJson(win, jsonText);

const readWidgetRecordsJson = async (win: Window): Promise<string | null> =>
	readWidgetJson(win);

const writeWidgetRecordsJson = async (
	win: Window,
	jsonText: string,
): Promise<void> => writeWidgetJson(win, jsonText);

const readWorkspacePanelStateFromSettingsJson = (
	settingsJson: string | null | undefined,
	baseState: SurfaceState,
): SurfaceState => {
	const settings = parseSettingsRoot(settingsJson);
	const normalizedKey = normalizeWorkspacePanelSettingsKey(baseState.panelId);
	const panelState =
		settings.workspace?.workspacePanels?.[normalizedKey] ??
		settings.workspace?.workspacePanels?.[baseState.panelId] ??
		null;
	if (
		!panelState ||
		typeof panelState !== "object" ||
		Array.isArray(panelState)
	) {
		return baseState;
	}
	const panelPresetIds = Array.isArray(
		(panelState as { presetIds?: unknown }).presetIds,
	)
		? ((panelState as { presetIds: unknown[] }).presetIds.flatMap((value) => {
				if (typeof value !== "string") return [];
				const trimmed = value.trim();
				return trimmed.length > 0 ? [trimmed] : [];
			}) as readonly string[])
		: [];
	return applyPersistedSurfaceState(baseState, {
		...(panelState as Partial<PersistedSurfaceState>),
		panelPresetIds: panelPresetIds,
	});
};

const mergeWorkspacePanelStateIntoSettingsJson = (
	settingsJson: string | null | undefined,
	state: SurfaceState,
): string => {
	const settings = parseSettingsRoot(settingsJson);
	const merged = mergeWorkspacePanelStateIntoSettings(settings, state);
	return `${JSON.stringify(merged, null, 2)}\n`;
};

const _mergeOnboardingPathsIntoSettingsJson = (
	settingsJson: string | null | undefined,
	payload: {
		supportRoot: string;
		subfolders: {
			presetRoot: string;
			scriptRoot: string;
			pluginRoot: string;
		};
	},
): string => {
	const settings = parseSettingsRoot(settingsJson);
	const nextSettings: SettingsRoot = {
		...settings,
		core: {
			...(settings.core ?? {}),
			paths: {
				...(settings.core?.paths ?? {}),
				supportRoot: payload.supportRoot,
				presetRoot: payload.subfolders.presetRoot,
				scriptRoot: payload.subfolders.scriptRoot,
				pluginRoot: payload.subfolders.pluginRoot,
			},
		},
	};
	return `${JSON.stringify(nextSettings, null, 2)}\n`;
};

export const mergeGroupPresetLayoutIntoSettingsJson = (
	settingsJson: string | null | undefined,
	payload: {
		panelId: string;
		presetIds: readonly string[];
		groupId: string;
		groupLayout: { x: number; y: number; width: number; height: number };
		childIds?: readonly string[];
	},
): string => {
	const settings = parseSettingsRoot(settingsJson);
	const panelKey = normalizeWorkspacePanelSettingsKey(payload.panelId);
	const workspace =
		settings.workspace &&
		typeof settings.workspace === "object" &&
		!Array.isArray(settings.workspace)
			? settings.workspace
			: {};
	const workspacePanels =
		workspace.workspacePanels &&
		typeof workspace.workspacePanels === "object" &&
		!Array.isArray(workspace.workspacePanels)
			? workspace.workspacePanels
			: {};
	const existingPanelState =
		workspacePanels[panelKey] &&
		typeof workspacePanels[panelKey] === "object" &&
		!Array.isArray(workspacePanels[panelKey])
			? workspacePanels[panelKey]
			: {};
	// Build next workspacePresetLayouts by removing child ids and adding group layout
	const existingLayouts = (existingPanelState as Record<string, unknown>)
		?.workspacePresetLayouts as
		| Record<string, { x: number; y: number; width: number; height: number }>
		| undefined
		| null;
	const nextLayouts = existingLayouts ? { ...existingLayouts } : {};
	if (payload.childIds) {
		for (const id of payload.childIds) {
			delete nextLayouts[id];
		}
	}
	nextLayouts[payload.groupId] = payload.groupLayout;
	const normalizedPresetIds = Array.from(
		new Set(
			payload.presetIds.flatMap((id) => {
				const trimmed = id.trim();
				return trimmed.length > 0 ? [trimmed] : [];
			}),
		),
	);
	const nextSettings: SettingsRoot = {
		...settings,
		workspace: {
			...workspace,
			workspacePanels: {
				...workspacePanels,
				[panelKey]: {
					...existingPanelState,
					workspacePresetLayouts: nextLayouts,
					panelPresetIds: normalizedPresetIds,
					presetIds: normalizedPresetIds,
				},
			},
		},
	};
	return `${JSON.stringify(nextSettings, null, 2)}\n`;
};

const mergeOnboardingPresetPlacementIntoSettingsJson = (
	settingsJson: string | null | undefined,
	payload: {
		panelId: string;
		presetIds: readonly string[];
	},
): string => {
	const settings = parseSettingsRoot(settingsJson);
	const normalizedPresetIds = Array.from(
		new Set(
			payload.presetIds.flatMap((id) => {
				const trimmed = id.trim();
				return trimmed.length > 0 ? [trimmed] : [];
			}),
		),
	);
	const workspace =
		settings.workspace &&
		typeof settings.workspace === "object" &&
		!Array.isArray(settings.workspace)
			? settings.workspace
			: {};
	const workspacePanels =
		workspace.workspacePanels &&
		typeof workspace.workspacePanels === "object" &&
		!Array.isArray(workspace.workspacePanels)
			? workspace.workspacePanels
			: {};
	const panelKey = normalizeWorkspacePanelSettingsKey(payload.panelId);
	const existingPanelState =
		workspacePanels[panelKey] &&
		typeof workspacePanels[panelKey] === "object" &&
		!Array.isArray(workspacePanels[panelKey])
			? workspacePanels[panelKey]
			: {};
	const nextSettings: SettingsRoot = {
		...settings,
		workspace: {
			...workspace,
			workspacePanels: {
				...workspacePanels,
				[panelKey]: {
					...existingPanelState,
					presetFocusId: normalizedPresetIds[0] ?? null,
					selectedPlacementIds: normalizedPresetIds,
					presetSelectedIds: normalizedPresetIds,
					// Keep archive-compatible panel payload shape.
					presetIds: normalizedPresetIds,
				},
			},
		},
	};
	return `${JSON.stringify(nextSettings, null, 2)}\n`;
};

const mergeOnboardingWorkspaceBootstrapIntoSettingsJson = (
	settingsJson: string | null | undefined,
	payload: {
		panelId: string;
		state: SurfaceState;
		presetIds: readonly string[];
	},
): string => {
	const settings = parseSettingsRoot(settingsJson);
	const panelKey = normalizeWorkspacePanelSettingsKey(payload.panelId);
	const workspace =
		settings.workspace &&
		typeof settings.workspace === "object" &&
		!Array.isArray(settings.workspace)
			? settings.workspace
			: {};
	const workspacePanels =
		workspace.workspacePanels &&
		typeof workspace.workspacePanels === "object" &&
		!Array.isArray(workspace.workspacePanels)
			? workspace.workspacePanels
			: {};
	const existingPanelState =
		workspacePanels[panelKey] &&
		typeof workspacePanels[panelKey] === "object" &&
		!Array.isArray(workspacePanels[panelKey])
			? workspacePanels[panelKey]
			: {};
	const persistedState = pickPersistedSurfaceState(payload.state);
	const nextSettings: SettingsRoot = {
		...settings,
		workspace: {
			...workspace,
			workspacePanels: {
				...workspacePanels,
				[panelKey]: {
					...existingPanelState,
					...persistedState,
					presetIds: [...payload.presetIds],
					panelPresetIds: [...payload.presetIds],
					workspacePresetLayouts: {},
				},
			},
		},
	};
	return `${JSON.stringify(nextSettings, null, 2)}\n`;
};

export const readPanelPresetIdsFromSettingsJson = (
	settingsJson: string | null | undefined,
	panelId: string,
): readonly string[] => {
	const settings = parseSettingsRoot(settingsJson);
	const panelKey = normalizeWorkspacePanelSettingsKey(panelId);
	const panelState = settings.workspace?.workspacePanels?.[panelKey];
	if (
		!panelState ||
		typeof panelState !== "object" ||
		Array.isArray(panelState)
	) {
		return [];
	}
	const ps = panelState as { presetIds?: unknown; panelPresetIds?: unknown };
	const merged: string[] = [];
	const pushStrings = (raw: unknown): void => {
		if (!Array.isArray(raw)) {
			return;
		}
		for (const value of raw) {
			if (typeof value !== "string") {
				continue;
			}
			const t = value.trim();
			if (t.length > 0) {
				merged.push(t);
			}
		}
	};
	pushStrings(ps.presetIds);
	pushStrings(ps.panelPresetIds);
	return Array.from(new Set(merged));
};

export const movePresetPlacement = (
	settingsJson: string | null | undefined,
	payload: {
		sourcePanelId: string;
		targetPanelId: string;
		presetIds: readonly string[];
		sourceFallbackPresetIds?: readonly string[];
	},
): string => {
	const settings = parseSettingsRoot(settingsJson);
	const movingIds = Array.from(
		new Set(
			payload.presetIds.flatMap((id) => {
				const trimmed = id.trim();
				return trimmed.length > 0 ? [trimmed] : [];
			}),
		),
	);
	if (movingIds.length === 0) {
		return `${JSON.stringify(settings, null, 2)}\n`;
	}
	const movingSet = new Set(movingIds);
	const sourceKey = normalizeWorkspacePanelSettingsKey(payload.sourcePanelId);
	const targetKey = normalizeWorkspacePanelSettingsKey(payload.targetPanelId);
	const workspace =
		settings.workspace &&
		typeof settings.workspace === "object" &&
		!Array.isArray(settings.workspace)
			? settings.workspace
			: {};
	const workspacePanels =
		workspace.workspacePanels &&
		typeof workspace.workspacePanels === "object" &&
		!Array.isArray(workspace.workspacePanels)
			? workspace.workspacePanels
			: {};
	const sourceState =
		workspacePanels[sourceKey] &&
		typeof workspacePanels[sourceKey] === "object" &&
		!Array.isArray(workspacePanels[sourceKey])
			? workspacePanels[sourceKey]
			: {};
	const targetState =
		workspacePanels[targetKey] &&
		typeof workspacePanels[targetKey] === "object" &&
		!Array.isArray(workspacePanels[targetKey])
			? workspacePanels[targetKey]
			: {};
	const sourcePresetIdsRaw = readPanelPresetIdsFromSettingsJson(
		settingsJson,
		payload.sourcePanelId,
	);
	const sourcePresetIds =
		sourcePresetIdsRaw.length > 0
			? [...sourcePresetIdsRaw]
			: Array.from(
					new Set(
						(payload.sourceFallbackPresetIds ?? []).flatMap((id) => {
							const trimmed = id.trim();
							return trimmed.length > 0 ? [trimmed] : [];
						}),
					),
				);
	const targetPresetIds = readPanelPresetIdsFromSettingsJson(
		settingsJson,
		payload.targetPanelId,
	);
	const nextSourcePresetIds = sourcePresetIds.filter(
		(id) => !movingSet.has(id),
	);
	const nextTargetPresetIds = Array.from(
		new Set([...targetPresetIds, ...movingIds]),
	);

	const nextSettings: SettingsRoot = {
		...settings,
		workspace: {
			...workspace,
			workspacePanels: {
				...workspacePanels,
				[sourceKey]: {
					...sourceState,
					presetFocusId: nextSourcePresetIds[0] ?? null,
					selectedPlacementIds: nextSourcePresetIds,
					presetSelectedIds: nextSourcePresetIds,
					presetIds: nextSourcePresetIds,
				},
				[targetKey]: {
					...targetState,
					presetFocusId: nextTargetPresetIds[0] ?? null,
					selectedPlacementIds: nextTargetPresetIds,
					presetSelectedIds: nextTargetPresetIds,
					presetIds: nextTargetPresetIds,
				},
			},
		},
	};
	return `${JSON.stringify(nextSettings, null, 2)}\n`;
};

const mergeWorkspacePanelStateIntoSettings = (
	settings: SettingsRoot,
	state: SurfaceState,
): SettingsRoot => {
	const workspace =
		settings.workspace &&
		typeof settings.workspace === "object" &&
		!Array.isArray(settings.workspace)
			? settings.workspace
			: {};
	const workspacePanels =
		workspace.workspacePanels &&
		typeof workspace.workspacePanels === "object" &&
		!Array.isArray(workspace.workspacePanels)
			? workspace.workspacePanels
			: {};
	const panelKey = normalizeWorkspacePanelSettingsKey(state.panelId);
	const existingPanelState =
		workspacePanels[panelKey] &&
		typeof workspacePanels[panelKey] === "object" &&
		!Array.isArray(workspacePanels[panelKey])
			? workspacePanels[panelKey]
			: {};
	const existingPresetIds = Array.isArray(
		(existingPanelState as { presetIds?: unknown }).presetIds,
	)
		? (existingPanelState as { presetIds: unknown[] }).presetIds.flatMap(
				(id) => {
					if (typeof id !== "string") return [];
					const trimmed = id.trim();
					return trimmed.length > 0 ? [trimmed] : [];
				},
			)
		: [];
	const nextPresetIds =
		state.panelPresetIds.length > 0
			? [...state.panelPresetIds]
			: existingPresetIds;
	const nextSettings: SettingsRoot = {
		...settings,
		workspace: {
			...workspace,
			workspacePanels: {
				...workspacePanels,
				[panelKey]: {
					...existingPanelState,
					...pickPersistedSurfaceState(state),
					presetIds: nextPresetIds,
					workspacePresetLayouts: {},
				},
			},
		},
	};
	return nextSettings;
};

/**
 * Remove persisted panel state for a single panel from settings.json.
 * Optionally also clear snapshots for that panel.
 * Does NOT touch other panels, preset records, or global settings.
 */
export const clearWorkspacePanelStateFromSettingsJson = (
	settingsJson: string | null | undefined,
	panelId: string,
	options: { clearSnapshots?: boolean } = {},
): string => {
	const settings = parseSettingsRoot(settingsJson);
	const panelKey = normalizeWorkspacePanelSettingsKey(panelId);
	const workspace =
		settings.workspace &&
		typeof settings.workspace === "object" &&
		!Array.isArray(settings.workspace)
			? settings.workspace
			: {};
	const workspacePanels =
		workspace.workspacePanels &&
		typeof workspace.workspacePanels === "object" &&
		!Array.isArray(workspace.workspacePanels)
			? workspace.workspacePanels
			: {};

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const { [panelKey]: _removed, ...remainingPanels } = workspacePanels;

	const nextSettings: SettingsRoot = {
		...settings,
		workspace: {
			...workspace,
			workspacePanels: remainingPanels,
		},
	};

	void options.clearSnapshots; // snapshot clearing is handled in workspace-runtime; file-backed layout is cleared here

	return `${JSON.stringify(nextSettings, null, 2)}\n`;
};

const saveWorkspacePanelState = (
	storage: Pick<Storage, "setItem">,
	state: SurfaceState,
): void => {
	storage.setItem(
		storageKey(state.panelId),
		JSON.stringify(pickPersistedSurfaceState(state)),
	);
};

// ── Workspace snapshot (named save/restore) ─────────────────────────────────

const MAX_SNAPSHOTS = 10;

export type WorkspaceSnapshot = {
	id: string;
	label: string;
	createdAt: string;
	/** @deprecated Use `panels` instead */
	widgets?: Layout[];
	/** Combined layout across all 5 panels (panel-N → Layout[]) */
	panels: Record<string, Layout[]>;
	workspacePresetLayouts?: Record<string, PresetLayout>;
	panelPresetIds?: readonly string[];
};

/**
 * Persist a new named snapshot for the given panel.
 * Rejects if panelId is empty; otherwise saves up to MAX_SNAPSHOTS.
 */
const _saveSnapshot = async (
	win: Window,
	panelId: string,
	snapshot: {
		label: string;
		widgets: Layout[];
		workspacePresetLayouts?: Record<string, PresetLayout>;
	},
): Promise<WorkspaceSnapshot | null> => {
	const trimmed = panelId.trim();
	if (!trimmed) return null;
	const ts = new Date();
	const id = String(ts.getTime());
	const createdAt = ts.toISOString();
	const full: WorkspaceSnapshot = {
		label: snapshot.label,
		widgets: snapshot.widgets,
		id,
		createdAt,
		workspacePresetLayouts: snapshot.workspacePresetLayouts,
		panels: {},
	};
	const existing = await listSnapshots(win, trimmed);
	const next = [...existing, full].slice(-MAX_SNAPSHOTS);
	await writeSnapshotsToSettingsJson(win, trimmed, next);
	return full;
};

/** Return all snapshots for the given panel, newest last. */
const listSnapshots = async (
	win: Window,
	panelId: string,
): Promise<WorkspaceSnapshot[]> => {
	const trimmed = panelId.trim();
	if (!trimmed) return [];
	try {
		const raw = await readSettings(win);
		return readSnapshotsFromSettingsJson(raw, trimmed);
	} catch {
		return [];
	}
};

/**
 * Remove the snapshot with the given id from the panel.
 * No-op if not found.
 */
const _deleteSnapshot = async (
	win: Window,
	panelId: string,
	snapshotId: string,
): Promise<void> => {
	const trimmed = panelId.trim();
	if (!trimmed || !snapshotId) return;
	const existing = await listSnapshots(win, trimmed);
	const next = existing.filter((s) => s.id !== snapshotId);
	await writeSnapshotsToSettingsJson(win, trimmed, next);
};

/**
 * Return the snapshot data (widgets + preset layouts) for the given ids,
 * or null if not found.
 */
const _restoreSnapshot = async (
	win: Window,
	panelId: string,
	snapshotId: string,
): Promise<Pick<
	WorkspaceSnapshot,
	"widgets" | "workspacePresetLayouts" | "panelPresetIds"
> | null> => {
	const trimmed = panelId.trim();
	if (!trimmed || !snapshotId) return null;
	const snaps = await listSnapshots(win, trimmed);
	const snap = snaps.find((s) => s.id === snapshotId);
	if (!snap) return null;
	return {
		widgets: (snap.widgets ?? snap.panels?.[panelId] ?? []).map((w) => ({
			...w,
		})),
		workspacePresetLayouts: { ...(snap.workspacePresetLayouts ?? {}) },
		panelPresetIds: snap.panelPresetIds ? [...snap.panelPresetIds] : undefined,
	};
};

// ── Snapshot helpers (internal) ────────────────────────────────────────────────

const readSnapshotsFromSettingsJson = (
	raw: string | null | undefined,
	panelId: string,
): WorkspaceSnapshot[] => {
	if (!raw?.trim()) return [];
	try {
		const settings = JSON.parse(raw as string) as SettingsRoot;
		const normalizedKey = normalizeWorkspacePanelSettingsKey(panelId);
		const ws = settings.workspace as
			| { snapshots?: Record<string, WorkspaceSnapshot[]> }
			| undefined;
		const snapArray = ws?.snapshots?.[normalizedKey];
		if (!Array.isArray(snapArray)) return [];
		return snapArray as WorkspaceSnapshot[];
	} catch {
		return [];
	}
};

const writeSnapshotsToSettingsJson = async (
	win: Window,
	panelId: string,
	snaps: WorkspaceSnapshot[],
): Promise<void> => {
	const normalizedKey = normalizeWorkspacePanelSettingsKey(panelId);
	const raw = await readSettings(win);
	const settings = parseSettingsRoot(raw);
	const workspace = (settings.workspace as Record<string, unknown>) ?? {};
	const snapshots =
		(workspace.snapshots as Record<string, WorkspaceSnapshot[]>) ?? {};
	const nextSettings: SettingsRoot = {
		...settings,
		workspace: {
			...workspace,
			snapshots: {
				...snapshots,
				[normalizedKey]: snaps,
			},
		},
	};
	await writeSettings(win, `${JSON.stringify(nextSettings, null, 2)}\n`);
};

/** State patch helper for modeless background dialog */
const _patchWorkspacePanelBackgroundInStorage = (
	storage: Pick<Storage, "getItem" | "setItem">,
	panelId: string,
	background: SurfaceState["bg"],
): void => {
	const key = storageKey(panelId);
	const raw = storage.getItem(key);
	let parsed: Record<string, unknown> = {};
	if (raw?.trim()) {
		try {
			parsed = JSON.parse(raw) as Record<string, unknown>;
		} catch {
			return;
		}
	}
	parsed.bg = background;
	storage.setItem(key, JSON.stringify(parsed));
};

const loadWorkspacePanelState = (
	storage: Pick<Storage, "getItem">,
	baseState: SurfaceState,
): SurfaceState => {
	try {
		const raw = storage.getItem(storageKey(baseState.panelId));
		if (!raw?.trim()) {
			return baseState;
		}
		const parsed = JSON.parse(raw) as Partial<PersistedSurfaceState>;
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			return baseState;
		}
		return applyPersistedSurfaceState(baseState, parsed);
	} catch {
		return baseState;
	}
};

const loadWorkspacePanelStateFromSettingsAsync = async (options: {
	win: Window;
	baseState: SurfaceState;
	readSettings?: (win: Window) => Promise<string | null>;
	writeSettings?: (win: Window, jsonText: string) => Promise<void>;
}): Promise<SurfaceState> => {
	const readSettingsFn = options.readSettings ?? readSettings;
	const _writeSettingsFn = options.writeSettings ?? writeSettings;

	const settingsJson = await readSettingsFn(options.win);

	if (settingsJson?.trim()) {
		const fromFile = readWorkspacePanelStateFromSettingsJson(
			settingsJson,
			options.baseState,
		);
		if (fromFile !== options.baseState) {
			return fromFile;
		}
	}

	return options.baseState;
};

function loadWorkspacePanelStateFromSettings(
	settings: SettingsRoot,
	baseState: SurfaceState,
): SurfaceState;
function loadWorkspacePanelStateFromSettings(options: {
	win: Window;
	baseState: SurfaceState;
	readSettings?: (win: Window) => Promise<string | null>;
	writeSettings?: (win: Window, jsonText: string) => Promise<void>;
}): Promise<SurfaceState>;
function loadWorkspacePanelStateFromSettings(
	arg1:
		| SettingsRoot
		| {
				win: Window;
				baseState: SurfaceState;
				readSettings?: (win: Window) => Promise<string | null>;
				writeSettings?: (win: Window, jsonText: string) => Promise<void>;
		  },
	arg2?: SurfaceState,
): SurfaceState | Promise<SurfaceState> {
	if (arg2) {
		return readWorkspacePanelStateFromSettingsJson(JSON.stringify(arg1), arg2);
	}
	return loadWorkspacePanelStateFromSettingsAsync(
		arg1 as {
			win: Window;
			baseState: SurfaceState;
			readSettings?: (win: Window) => Promise<string | null>;
			writeSettings?: (win: Window, jsonText: string) => Promise<void>;
		},
	);
}

const _saveWorkspacePanelStateToSettings = async (options: {
	win: Window;
	state: SurfaceState;
	readSettings?: (win: Window) => Promise<string | null>;
	writeSettings?: (win: Window, jsonText: string) => Promise<void>;
}): Promise<void> => {
	const readSettingsFn = options.readSettings ?? readSettings;
	const writeSettingsFn = options.writeSettings ?? writeSettings;
	const settingsJson = await readSettingsFn(options.win);
	await writeSettingsFn(
		options.win,
		mergeWorkspacePanelStateIntoSettingsJson(settingsJson, options.state),
	);
};

export const readThemeCss = async (win: Window): Promise<string | null> => {
	const root = await resolveReadManagedRoot(win);
	if (!root) return null;
	return readJsonFileText(win, resolveStylesThemeCssPath(root));
};

/**
 * Strict variant for read-modify-write callers: rejects on I/O errors
 * (EACCES, EIO, …) instead of reporting them as "file absent". A caller
 * that writes back what it read must not treat an unreadable theme.css as
 * empty — the next write would erase every persisted override (Issue #91
 * review; same contract as `readJsonFileTextStrict`, Issue #204).
 */
export const readThemeCssStrict = async (
	win: Window,
): Promise<string | null> => {
	const root = await resolveReadManagedRoot(win);
	if (!root) return null;
	return readJsonFileTextStrict(win, resolveStylesThemeCssPath(root));
};

export const writeThemeCss = async (
	win: Window,
	cssText: string,
): Promise<void> => {
	const root = await resolveWriteManagedRoot(win);
	await writeJsonFileText(win, resolveStylesThemeCssPath(root), cssText);
};

// ── Control Panel State ───────────────────────────────────────────────────────

const readControlPanelStateFromSettingsJson = (
	settingsJson: string | null | undefined,
): CpPersistedState | null => {
	const settings = parseSettingsRoot(settingsJson);
	const cp = settings.controlPanel;
	if (!cp || typeof cp !== "object") {
		return null;
	}
	const cpRecord = cp as Record<string, unknown>;
	const positions: CpPosition[] = [
		"top-left",
		"top-center",
		"top-right",
		"bottom-left",
		"bottom-center",
		"bottom-right",
		"left-top",
		"left-center",
		"left-bottom",
		"right-top",
		"right-center",
		"right-bottom",
	];
	const orientations: CpOrientation[] = ["horizontal", "vertical"];
	const position = positions.includes(cpRecord.position as CpPosition)
		? (cpRecord.position as CpPosition)
		: null;
	const orientation = orientations.includes(
		cpRecord.orientation as CpOrientation,
	)
		? (cpRecord.orientation as CpOrientation)
		: null;
	const collapsed =
		typeof cpRecord.collapsed === "boolean" ? cpRecord.collapsed : null;
	if (position === null && orientation === null && collapsed === null) {
		return null;
	}
	return {
		position: position ?? "bottom-right",
		orientation: orientation ?? "horizontal",
		collapsed: collapsed ?? false,
	};
};

export const saveControlPanelState = async (
	win: Window,
	cpState: CpPersistedState,
	_panelId = "panel-1",
): Promise<void> => {
	await writeJson(win, "controlPanel", cpState);
};

type FileBrowserWidgetRecord = {
	id: string;
	widgetType: string;
};

export const resolveFileBrowserCatalogInstanceId = (
	records: readonly FileBrowserWidgetRecord[],
): string | null => {
	for (const r of records) {
		if (
			r.widgetType === "directory-browser" ||
			r.widgetType === "file-browser"
		) {
			return r.id;
		}
	}
	return null;
};

export const isLegacyFileBrowserCatalogRowId = (key: string): boolean => {
	return /^panel-?\d/.test(key);
};

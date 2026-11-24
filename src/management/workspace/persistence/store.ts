import {
	readPresetJson,
	writePresetJson,
} from "@/management/catalog/json-files";
import type {
	CpOrientation,
	CpPersistedState,
	CpPosition,
} from "@/management/panel/control/types";
import { resolveStylesThemeCssPath } from "@/management/storage/file";
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
import type { SurfaceState } from "@/management/workspace/core/state";
import type {
	Layout,
	PresetLayout,
} from "@/management/workspace/layout/grid-document";

const WORKSPACE_PANEL_STATE_STORAGE_KEY_PREFIX = "ty-plus-workspace-state-v1:";

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

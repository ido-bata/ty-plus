import {
	type Dispatch,
	type RefObject,
	type SetStateAction,
	useCallback,
	useEffect,
	useMemo,
	useReducer,
	useRef,
	useState,
} from "react";
import { detectCepHostCode } from "@/management/ae/cep/runtime";
import { readGroupJson } from "@/management/catalog/json-files";
import { resolvePresetToolSurfaceIdForPreset } from "@/management/preset/authoring/request";
import {
	ICON_GRID_SCALE_LS_KEY,
	ICON_TILE_ASPECT_LS_KEY,
	type IconTileAspect,
} from "@/management/preset/catalog-browser/layout";
import { buildPlacementHints } from "@/management/preset/catalog-browser/workspace-placement-hints";
import type { Preset } from "@/management/preset/contract";
import { traceExecute } from "@/management/preset/execution/lifecycle-trace";
import {
	type GroupEntry,
	parseGroupFromText,
} from "@/management/preset/group-catalog";
import { getPresetToolDialogEntry } from "@/management/preset/registry";
import {
	getPreset,
	listPresets,
	removeLocalPreset,
} from "@/management/preset/use-cases";
import { stripKnownIdPrefixes } from "@/management/storage/ids";
import { readSettings } from "@/management/storage/workspace/store";
import { openPresetEditSurface } from "@/management/workspace/hooks/preset";
import { executeWorkspacePresetForWindow } from "@/management/workspace/runtime";
import { useCatalogViewMode } from "@/shared/util/catalog-view-mode";
import { useIconGridScale } from "@/shared/util/icon-grid-scale";
import { useTileAspect } from "@/shared/util/tile-aspect";

import { presetWorkspaceSummary } from "./preset-browser-helpers";

const CHUNK = 18;

export type LoadPhase = "idle" | "reading" | "streaming" | "error";

type LoadState = {
	phase: LoadPhase;
	error: string | null;
	presets: Preset[];
	streamTotal: number;
	groups: readonly GroupEntry[];
	placement: ReadonlyMap<string, readonly string[]>;
	groupPlacement: ReadonlyMap<string, readonly string[]>;
};

type LoadAction =
	| { type: "START_READING" }
	| {
			type: "DATA_LOADED";
			presets: Preset[];
			groups: readonly GroupEntry[];
			placement: ReadonlyMap<string, readonly string[]>;
			groupPlacement: ReadonlyMap<string, readonly string[]>;
			streamTotal: number;
	  }
	| { type: "STREAM_APPEND"; presets: Preset[] }
	| { type: "STREAM_DONE" }
	| { type: "SET_ERROR"; error: string };

function loadReducer(state: LoadState, action: LoadAction): LoadState {
	switch (action.type) {
		case "START_READING":
			return {
				...state,
				phase: "reading",
				error: null,
				presets: [],
				streamTotal: 0,
			};
		case "DATA_LOADED":
			return {
				...state,
				presets: [],
				groups: action.groups,
				placement: action.placement,
				groupPlacement: action.groupPlacement,
				streamTotal: action.streamTotal,
				phase: "streaming",
			};
		case "STREAM_APPEND":
			return { ...state, presets: [...state.presets, ...action.presets] };
		case "STREAM_DONE":
			return { ...state, phase: "idle" };
		case "SET_ERROR":
			return { ...state, phase: "error", error: action.error };
	}
}

const INITIAL_LOAD_STATE: LoadState = {
	phase: "idle",
	error: null,
	presets: [],
	streamTotal: 0,
	groups: [],
	placement: new Map(),
	groupPlacement: new Map(),
};

export type PresetViewMode = "list" | "icons";

type PresetIconBrowse = "root" | { kind: "group"; id: string };

type PresetGroupBlock = { group: GroupEntry; members: Preset[] };

type PresetIconRootEntry =
	| { kind: "group"; group: GroupEntry; members: Preset[] }
	| { kind: "preset"; preset: Preset };

type PresetsCatalogApi = {
	filter: string;
	setFilter: Dispatch<SetStateAction<string>>;
	clearSearch: () => void;
	pasteSearch: () => Promise<void>;
	copyId: (id: string) => Promise<void>;
	loadPhase: LoadPhase;
	loadError: string | null;
	presets: Preset[];
	streamTotal: number;
	groups: readonly GroupEntry[];
	groupPlacement: ReadonlyMap<string, readonly string[]>;
	reload: () => Promise<void>;
	viewMode: PresetViewMode;
	setViewMode: Dispatch<SetStateAction<PresetViewMode>>;
	toggleView: () => void;
	expandedGroups: Set<string>;
	toggleGroup: (id: string) => void;
	iconBrowse: PresetIconBrowse;
	setIconBrowse: Dispatch<SetStateAction<PresetIconBrowse>>;
	iconGridScale: number;
	iconGridHostRef: RefObject<HTMLDivElement | null>;
	iconTileAspect: IconTileAspect;
	setIconTileAspect: Dispatch<SetStateAction<IconTileAspect>>;
	groupBlocks: PresetGroupBlock[];
	ungroupedMembers: Preset[];
	visibleCount: number;
	iconRootEntries: PresetIconRootEntry[];
	iconBrowseGroup: PresetGroupBlock | undefined;
	summarizePresetWorkspace: (p: Preset) => string;
	onRun: (id: string) => Promise<void>;
	onEdit: (id: string) => Promise<void>;
	onDelete: (id: string) => Promise<void>;
	groupEdit: (id: string) => void;
	groupDelete: (id: string) => void;
	closeWindow: () => void;
};

type PresetsCatalogOptions = {
	surfaceId: string;
	closeWindow: () => void;
};

function usePresetsCatalog(opts: PresetsCatalogOptions): PresetsCatalogApi {
	const { surfaceId, closeWindow } = opts;
	const hostCode = useMemo(() => detectCepHostCode(), []);

	const [filter, setFilter] = useState("");
	const [loadState, dispatchLoad] = useReducer(loadReducer, INITIAL_LOAD_STATE);
	const {
		phase: loadPhase,
		error: loadError,
		presets,
		streamTotal,
		groups,
		placement,
		groupPlacement,
	} = loadState;
	const {
		viewMode,
		setViewMode,
		toggleView: toggleViewMode,
	} = useCatalogViewMode();
	const [iconBrowse, setIconBrowse] = useState<PresetIconBrowse>("root");
	const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
		() => new Set(),
	);

	const { scale: iconGridScale, hostRef: iconGridHostRef } = useIconGridScale({
		storageKey: ICON_GRID_SCALE_LS_KEY,
		enabled: viewMode === "icons",
	});
	const { aspect: iconTileAspect, setAspect: setIconTileAspect } =
		useTileAspect({
			storageKey: ICON_TILE_ASPECT_LS_KEY,
		});

	const fullListRef = useRef<Preset[]>([]);
	const streamTimerRef = useRef<number | null>(null);

	const loadEverything = useCallback(async () => {
		dispatchLoad({ type: "START_READING" });
		fullListRef.current = [];
		try {
			const [all, groupText, settingsJson] = await Promise.all([
				listPresets(),
				readGroupJson(window),
				readSettings(window),
			]);
			const parsedGroups = parseGroupFromText(groupText);
			const { presetLocations, groupLocations } = await buildPlacementHints(
				window,
				settingsJson,
				all,
				parsedGroups,
			);
			dispatchLoad({
				type: "DATA_LOADED",
				presets: all,
				groups: parsedGroups,
				placement: presetLocations,
				groupPlacement: groupLocations,
				streamTotal: all.length,
			});
			fullListRef.current = all;
			let offset = 0;
			const step = (): void => {
				const slice = fullListRef.current.slice(offset, offset + CHUNK);
				offset += CHUNK;
				dispatchLoad({ type: "STREAM_APPEND", presets: slice });
				if (offset < fullListRef.current.length) {
					streamTimerRef.current = window.requestAnimationFrame(step);
				} else {
					dispatchLoad({ type: "STREAM_DONE" });
					streamTimerRef.current = null;
				}
			};
			streamTimerRef.current = window.requestAnimationFrame(step);
		} catch (e) {
			dispatchLoad({
				type: "SET_ERROR",
				error: e instanceof Error ? e.message : String(e),
			});
		}
	}, []);

	useEffect(() => {
		void loadEverything();
		return () => {
			if (streamTimerRef.current != null) {
				window.cancelAnimationFrame(streamTimerRef.current);
			}
		};
	}, [loadEverything]);

	const groupedIdSet = useMemo(() => {
		const s = new Set<string>();
		for (const g of groups) {
			for (const raw of g.presetIds) {
				const id = String(raw ?? "").trim();
				if (!id) {
					continue;
				}
				s.add(id);
				const bare = stripKnownIdPrefixes(id);
				if (bare && bare !== id) {
					s.add(bare);
				}
			}
		}
		return s;
	}, [groups]);

	const filteredPresets = useMemo(() => {
		const q = filter.trim().toLowerCase();
		if (!q) {
			return presets;
		}
		return presets.filter(
			(p) =>
				p.id.toLowerCase().includes(q) ||
				(p.title ?? "").toLowerCase().includes(q) ||
				p.type.toLowerCase().includes(q) ||
				p.filePath.toLowerCase().includes(q),
		);
	}, [filter, presets]);

	const filteredPresetMap = useMemo(
		() => new Map(filteredPresets.map((p) => [p.id, p])),
		[filteredPresets],
	);

	const { groupBlocks, ungroupedMembers } = useMemo(() => {
		const blocks: PresetGroupBlock[] = [];
		for (const g of groups) {
			const members = g.presetIds
				.map((raw) => {
					const id = String(raw ?? "").trim();
					if (!id) {
						return undefined;
					}
					const bare = stripKnownIdPrefixes(id);
					return filteredPresetMap.get(id) ?? filteredPresetMap.get(bare);
				})
				.filter((p): p is Preset => Boolean(p));
			if (members.length === 0) {
				continue;
			}
			blocks.push({ group: g, members });
		}
		const ungrouped = filteredPresets.filter((p) => !groupedIdSet.has(p.id));
		return { groupBlocks: blocks, ungroupedMembers: ungrouped };
	}, [filteredPresetMap, filteredPresets, groupedIdSet, groups]);

	const presetParentGroupId = useMemo(() => {
		const m = new Map<string, string>();
		for (const g of groups) {
			for (const raw of g.presetIds) {
				const id = String(raw ?? "").trim();
				if (!id) {
					continue;
				}
				const bare = stripKnownIdPrefixes(id);
				m.set(id, g.id);
				if (bare && bare !== id) {
					m.set(bare, g.id);
				}
			}
		}
		return m;
	}, [groups]);

	const groupsById = useMemo(
		() => new Map(groups.map((g) => [g.id, g])),
		[groups],
	);

	const summarizePresetWorkspace = useCallback(
		(p: Preset) =>
			presetWorkspaceSummary(
				p,
				placement,
				groupPlacement,
				presetParentGroupId,
				groupsById,
			),
		[placement, groupPlacement, presetParentGroupId, groupsById],
	);

	useEffect(() => {
		if (viewMode !== "icons" || iconBrowse === "root") {
			return;
		}
		if (
			iconBrowse.kind === "group" &&
			!groupBlocks.some((b) => b.group.id === iconBrowse.id)
		) {
			setIconBrowse("root");
		}
	}, [viewMode, iconBrowse, groupBlocks]);

	const onRun = useCallback(
		async (id: string) => {
			try {
				const preset = await getPreset(id);
				if (!preset) return;
				await traceExecute(preset, "catalog-browser", () =>
					executeWorkspacePresetForWindow(window, hostCode, preset),
				);
			} catch {
				/* status strip shows error via reload */
			}
		},
		[hostCode],
	);

	const onEdit = useCallback(
		async (id: string) => {
			const isGroup = groups.some((g) => g.id === id);
			if (isGroup) {
				await openPresetEditSurface(window, surfaceId, id);
				return;
			}
			const preset = await getPreset(id);
			if (!preset) {
				return;
			}
			const toolSurface = resolvePresetToolSurfaceIdForPreset(preset);
			if (!getPresetToolDialogEntry(toolSurface)) {
				return;
			}
		},
		[groups, surfaceId],
	);

	const onDelete = useCallback(
		async (id: string) => {
			await removeLocalPreset(id);
			await loadEverything();
		},
		[loadEverything],
	);

	const clearSearch = useCallback(() => {
		setFilter("");
	}, []);

	const pasteSearch = useCallback(async () => {
		try {
			const t = await navigator.clipboard.readText();
			setFilter((prev) => `${prev}${t}`);
		} catch {
			/* ignore */
		}
	}, []);

	const copyId = useCallback(async (id: string) => {
		try {
			await navigator.clipboard.writeText(id);
		} catch {
			/* ignore */
		}
	}, []);

	const toggleView = useCallback(() => {
		toggleViewMode();
		setIconBrowse("root");
	}, [toggleViewMode]);

	const groupEdit = useCallback(
		(id: string) => {
			void onEdit(id);
		},
		[onEdit],
	);

	const groupDelete = useCallback(
		(id: string) => {
			void onDelete(id);
		},
		[onDelete],
	);

	const toggleGroup = useCallback((id: string) => {
		setExpandedGroups((prev) => {
			const n = new Set(prev);
			if (n.has(id)) {
				n.delete(id);
			} else {
				n.add(id);
			}
			return n;
		});
	}, []);

	const visibleCount = useMemo(() => {
		let n = ungroupedMembers.length;
		for (const b of groupBlocks) {
			n += b.members.length;
		}
		return n;
	}, [groupBlocks, ungroupedMembers]);

	const iconRootEntries = useMemo<PresetIconRootEntry[]>(() => {
		const entries: PresetIconRootEntry[] = [];
		for (const b of groupBlocks) {
			entries.push({ kind: "group", group: b.group, members: b.members });
		}
		for (const p of ungroupedMembers) {
			entries.push({ kind: "preset", preset: p });
		}
		return entries;
	}, [groupBlocks, ungroupedMembers]);

	const iconBrowseGroup =
		iconBrowse !== "root" && iconBrowse.kind === "group"
			? groupBlocks.find((b) => b.group.id === iconBrowse.id)
			: undefined;

	return {
		filter,
		setFilter,
		clearSearch,
		pasteSearch,
		copyId,
		loadPhase,
		loadError,
		presets,
		streamTotal,
		groups,
		groupPlacement,
		reload: loadEverything,
		viewMode,
		setViewMode,
		toggleView,
		expandedGroups,
		toggleGroup,
		iconBrowse,
		setIconBrowse,
		iconGridScale,
		iconGridHostRef,
		iconTileAspect,
		setIconTileAspect,
		groupBlocks,
		ungroupedMembers,
		visibleCount,
		iconRootEntries,
		iconBrowseGroup,
		summarizePresetWorkspace,
		onRun,
		onEdit,
		onDelete,
		groupEdit,
		groupDelete,
		closeWindow,
	};
}

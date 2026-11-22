import {
	Button,
	Icon,
	IconButton,
	isIMEComposing,
	ListSelect,
	PathField,
	SearchField,
} from "@ty-plus/ui";
import { ChevronRight, FolderOpen, Play, Search } from "lucide-react";
import {
	type CSSProperties,
	type JSX,
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useTranslation } from "react-i18next";
import { resolveEffectMatchName } from "@/function/widget/utility/directory-browser/plugin-match-name";
import { useCep } from "@/management/ae/cep/contexts/CepContext";
import { selectFolder } from "@/management/ae/cep/dialog-shim/bolt";
import { createCepHostExecutor } from "@/management/ae/cep/host-executor";
import { detectCepHostCode } from "@/management/ae/cep/runtime";
import { readGroupJson } from "@/management/catalog/json-files";
import { notificationStore } from "@/management/online/notification/service";
import {
	CatalogBrowserShell,
	ICON_CELL_BASE_REM,
	ICON_GRID_CLASS,
	ICON_GRID_SCALE_LS_KEY,
	ICON_TILE_ASPECT_LS_KEY,
} from "@/management/preset";
import { isPresetAssetMissing } from "@/management/preset/assets/health";
import { PresetIconTile } from "@/management/preset/components/PresetIconTile";
import { PresetListRow } from "@/management/preset/components/PresetListRow";
import type {
	Preset,
	PresetRecord,
	PresetType,
} from "@/management/preset/contract";
import { traceExecute } from "@/management/preset/execution/lifecycle-trace";
import {
	type GroupEntry,
	parseGroupFromText,
} from "@/management/preset/group/catalog";
import { getPreset } from "@/management/preset/operations";
import {
	parentDirectoryOf,
	siblingPathKey,
	stemWithoutExtension,
} from "@/management/preset/sibling-thumbnail";
import { readSettings } from "@/management/storage";
import { getCandidatesSnapshot } from "@/management/storage/candidates-cache/runtime";
import {
	canUseCepNodeFileBrowser,
	createCepNodeFileBrowserService,
	type FileBrowserEntry,
	type FileBrowserFileType,
} from "@/management/storage/file-browser-service";
import {
	type FileEntry,
	FileEntryList,
} from "@/management/storage/ui/file-entry/FileEntryList";
import { executeWorkspacePresetForWindow } from "@/management/workspace/core/runtime";
import type { SurfaceState } from "@/management/workspace/core/state";
import { useCatalogViewMode } from "@/shared/util/catalog-view-mode";
import { useIconGridScale } from "@/shared/util/icon-grid-scale";
import { useTileAspect } from "@/shared/util/tile-aspect";
import { css } from "@/styled-system/css";
import { CollapsibleGroupHeader } from "./CollapsibleGroupHeader";
import { EntryThumb } from "./EntryThumb";
import { renderFilterPanel } from "./filter-panel";
import { formatPathForMode } from "./format-path";
import { DEFAULT_CARD_SIZE, useCardZoom } from "./hooks/useCardZoom";
import {
	DRIVES_SENTINEL,
	isAtDriveRoot,
	loadWindowsDriveRows,
} from "./load-drives";
import {
	type GroupedCatalogPresets,
	partitionCatalogPresetsByGroup,
} from "./partition-catalog-presets";
import { renderToolbar } from "./toolbar";
import type { FileBrowserBrowseMode, FileBrowserFilter } from "./types";

async function resolvePresetForRun(
	presetId: string,
	t: (key: string, options?: Record<string, unknown>) => string,
): Promise<Preset> {
	const preset = await getPreset(presetId);
	if (!preset) {
		throw new Error(t("directoryBrowser.actions.presetNotFound", { presetId }));
	}
	return preset;
}

function normPathKey(p: string): string {
	return p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

/** Preset / script / project files that may pair with a same-stem thumbnail image. */
const PRESET_SIDEKICK_SOURCE_EXT = new Set([
	".ffx",
	".jsx",
	".jsxbin",
	".aep",
	".aepx",
	".aet",
	".mogrt",
	".zxp",
]);

const COMPANION_IMAGE_FILE_RE = /\.(png|jpe?g|gif|webp|svg)$/i;

function isCompanionThumbnailImageEntry(entry: FileBrowserEntry): boolean {
	if (entry.isDirectory) {
		return false;
	}
	return COMPANION_IMAGE_FILE_RE.test(entry.name);
}

function buildSidekickByParent(
	entries: readonly FileBrowserEntry[],
	presets: readonly PresetRecord[],
): ReadonlyMap<string, ReadonlySet<string>> {
	const map = new Map<string, Set<string>>();
	const addStem = (parentDir: string, stem: string): void => {
		const k = siblingPathKey(parentDir);
		const st = stem.toLowerCase();
		if (!st) {
			return;
		}
		let bucket = map.get(k);
		if (!bucket) {
			bucket = new Set();
			map.set(k, bucket);
		}
		bucket.add(st);
	};

	for (const p of presets) {
		const fp = p.filePath?.trim();
		if (!fp) {
			continue;
		}
		const ext = (fp.match(/\.[^./\\]+$/)?.[0] ?? "").toLowerCase();
		if (!PRESET_SIDEKICK_SOURCE_EXT.has(ext)) {
			continue;
		}
		const par = parentDirectoryOf(fp);
		if (!par) {
			continue;
		}
		addStem(par, stemWithoutExtension(fp));
	}

	for (const e of entries) {
		if (e.isDirectory) {
			continue;
		}
		const ext = (e.extension ?? "").toLowerCase();
		if (!PRESET_SIDEKICK_SOURCE_EXT.has(ext)) {
			continue;
		}
		const par = parentDirectoryOf(e.path);
		if (!par) {
			continue;
		}
		addStem(par, stemWithoutExtension(e.path));
	}

	return map;
}

function presetFileInCurrentDir(filePath: string, currentDir: string): boolean {
	const f = normPathKey(filePath);
	const d = normPathKey(currentDir);
	if (!f || !d) {
		return false;
	}
	return f === d || f.startsWith(`${d}/`);
}

function matchesPresetQuery(preset: PresetRecord, q: string): boolean {
	const t = q.trim().toLowerCase();
	if (!t) {
		return true;
	}
	return (
		preset.id.toLowerCase().includes(t) ||
		(preset.title ?? "").toLowerCase().includes(t) ||
		preset.type.toLowerCase().includes(t) ||
		preset.filePath.toLowerCase().includes(t)
	);
}

function entryMatchesCoarseFilter(
	e: FileBrowserEntry,
	f: FileBrowserFilter,
): boolean {
	if (f === "all") {
		return true;
	}
	if (e.isDirectory) {
		return true;
	}
	if (f === "media") {
		return (
			e.fileType === "image" ||
			e.fileType === "video" ||
			e.fileType === "audio" ||
			e.fileType === "psd" ||
			e.fileType === "ai" ||
			e.fileType === "mogrt" ||
			e.fileType === "image-sequence"
		);
	}
	if (f === "presets") {
		return e.fileType === "ae-preset" || e.fileType === "mogrt";
	}
	if (f === "scripts") {
		return e.fileType === "script";
	}
	if (f === "fonts") {
		return e.fileType === "font";
	}
	return true;
}

function entryPassesDetailFilters(
	e: FileBrowserEntry,
	hiddenFileTypes: readonly FileBrowserFileType[],
	hiddenExtensions: readonly string[],
): boolean {
	if (e.isDirectory) {
		return true;
	}
	if (hiddenFileTypes.includes(e.fileType)) {
		return false;
	}
	const ext = (e.extension ?? "").toLowerCase();
	if (ext && hiddenExtensions.includes(ext)) {
		return false;
	}
	return true;
}

function parentRow(parentPath: string): FileBrowserEntry {
	return {
		name: "..",
		path: parentPath,
		isDirectory: true,
		size: 0,
		modifiedAt: new Date(0).toISOString(),
		extension: "",
		fileType: "unknown",
	};
}

// Local TYPE_ICON / EntryGlyph / EntryThumb definitions used to live
// here as duplicates of `./EntryGlyph` and `./EntryThumb`. They have
// been removed in favour of the standalone modules, which route every
// image entry (including preset sidecar siblings) through the
// `useThumbnail` gateway hook per ADR-003.

type AnchorRow = { label: string; path: string; isDefault?: boolean };

const anchorRowIconWrapClass = css({
	display: "flex",
	height: "7",
	width: "7",
	flexShrink: 0,
	alignItems: "center",
	justifyContent: "center",
	borderRadius: "shell-sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.widget",
	color: "text.muted",
});

const anchorRowTrailingClass = css({ flexShrink: 0, color: "text.muted" });

const emptyStateClass = css({
	paddingBlock: "8",
	textAlign: "center",
	fontSize: "shell-text-sm",
	color: "text.muted",
});

const emptyStateErrorClass = css({
	paddingBlock: "4",
	textAlign: "center",
	fontSize: "shell-text-sm",
	color: "status.error",
});

const fileListClass = css({
	display: "flex",
	flexDirection: "column",
	overflow: "hidden",
	borderRadius: "shell-sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
});

const listHeaderClass = css({
	display: "flex",
	alignItems: "center",
	gap: "2",
	borderBottomWidth: "1px",
	borderBottomStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.dialog",
	paddingInline: "2",
	paddingBlock: "1.5",
});

const listHeaderNameClass = css({
	minWidth: 0,
	flex: 1,
	truncate: true,
	fontSize: "text-2xs",
	fontWeight: "medium",
	letterSpacing: "wide",
	textTransform: "uppercase",
	color: "text.muted",
});

function AnchorRowButton({
	label,
	subtitle,
	entryPath,
	onActivate,
}: {
	label: string;
	subtitle: string;
	entryPath: string;
	onActivate: () => void;
}): JSX.Element {
	return (
		<Button
			type="button"
			variant="bare"
			uiSize="md"
			fullWidth
			className={css({
				display: "flex",
				minWidth: 0,
				alignItems: "center",
				justifyContent: "flex-start",
				gap: "2",
			})}
			onDoubleClick={onActivate}
			onKeyDown={(ev) => {
				if (isIMEComposing(ev)) return;
				if (ev.key !== "Enter") return;
				ev.preventDefault();
				onActivate();
			}}
			data-directory-browser-entry
			data-entry-kind="dir"
			data-entry-path={entryPath}
		>
			<span
				aria-hidden
				className={css({ width: "9", minHeight: "1px", flexShrink: 0 })}
			/>
			<span
				className={css({
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
				})}
			>
				<span className={anchorRowIconWrapClass}>
					<Icon icon={FolderOpen} size={14} aria-hidden />
				</span>
			</span>
			<div className={css({ minWidth: 0, flex: "1" })}>
				<div
					className={css({
						truncate: true,
						fontSize: "shell-text-sm",
						fontWeight: "medium",
						color: "text.primary",
					})}
				>
					{label}
				</div>
				<div
					className={css({
						truncate: true,
						fontSize: "text-xs",
						color: "text.muted",
					})}
				>
					{subtitle}
				</div>
			</div>
			<span className={anchorRowTrailingClass}>
				<Icon icon={ChevronRight} size={12} aria-hidden />
			</span>
		</Button>
	);
}

export function DirectoryBrowserWidget({
	state,
}: {
	state: SurfaceState;
}): JSX.Element {
	const { t } = useTranslation("widgets");
	const { isCep } = useCep();
	const widgetPanelRef = useRef<HTMLDivElement>(null);
	const { viewMode, setViewMode } = useCatalogViewMode();
	const { scale: iconGridScale, hostRef: iconGridHostRef } = useIconGridScale({
		storageKey: ICON_GRID_SCALE_LS_KEY,
		enabled: viewMode === "icons",
	});
	const { aspect: iconTileAspect } = useTileAspect({
		storageKey: ICON_TILE_ASPECT_LS_KEY,
	});
	const searchInputRef = useRef<HTMLInputElement>(null);
	const thumbListInflight = useRef(
		new Map<string, Promise<readonly FileBrowserEntry[]>>(),
	);

	// Multi-select state (Issue #34 Option A). Lives parallel to the
	// single-select `fileBrowserSelectedPath` so navigation continues to
	// use single-select semantics while the checkbox overlay drives a
	// separate Set. The Set is keyed on the absolute file path so the
	// checkbox stays bound to the entry even when the directory changes.
	const [selectedFiles, setSelectedFiles] = useState<ReadonlySet<string>>(
		() => new Set(),
	);
	const isFileSelected = useCallback(
		(p: string): boolean => selectedFiles.has(p),
		[selectedFiles],
	);
	// Diagnostic counters for Issue #41 (multi-select checkbox "no-op" report).
	// Gated behind `window.__tyPlusMultiSelectDebug` so production behavior is
	// unaffected. The reviewer can open the CEP panel devtools and inspect
	// `window.__tyPlusMultiSelectDebug.lastClick` to confirm whether the click
	// handler fired at all in the live panel. See PR body for the AE 実機
	// reproduction guide.
	const multiSelectClickCount = useRef(0);
	const toggleFileSelected = useCallback((p: string): void => {
		multiSelectClickCount.current += 1;
		if (typeof window !== "undefined") {
			const debugBag = (
				window as unknown as {
					__tyPlusMultiSelectDebug?: {
						lastClick: { path: string; count: number; at: number };
					};
				}
			).__tyPlusMultiSelectDebug;
			if (debugBag) {
				debugBag.lastClick = {
					path: p,
					count: multiSelectClickCount.current,
					at: Date.now(),
				};
			}
		}
		setSelectedFiles((prev) => {
			const next = new Set(prev);
			if (next.has(p)) {
				next.delete(p);
			} else {
				next.add(p);
			}
			return next;
		});
	}, []);

	// Ctrl+wheel card zoom (Issue #27). Wired once at the widget root and
	// attached to BOTH list and grid outer wrappers so either view can be
	// zoomed without changing the layout / scroll context.
	const { cardSize, onWheel: onCardZoomWheel } = useCardZoom();

	// Local file browser states
	const [fileBrowserBrowseMode, setFileBrowserBrowseMode] =
		useState<FileBrowserBrowseMode>("filesystem");
	const [fileBrowserQuery, setFileBrowserQuery] = useState<string>("");
	const [fileBrowserRecursiveSearch, setFileBrowserRecursiveSearch] =
		useState<boolean>(false);
	const [fileBrowserEntries, setFileBrowserEntries] = useState<
		readonly FileBrowserEntry[]
	>([]);
	const [fileBrowserSearchEntries, setFileBrowserSearchEntries] = useState<
		readonly FileBrowserEntry[]
	>([]);
	const [fileBrowserParentDir, setFileBrowserParentDir] = useState<
		string | null
	>(null);
	const [fileBrowserCurrentDir, setFileBrowserCurrentDir] =
		useState<string>("");
	const [fileBrowserSelectedPath, setFileBrowserSelectedPath] =
		useState<string>("");
	// Single-click focus for directory rows (Issue #142). Kept separate from
	// `fileBrowserSelectedPath` so file selection and directory focus are
	// independent single-select cues; selecting one clears the other. The
	// focus is recorded together with the directory it was made in so it
	// automatically stops applying after navigation — no reset effect.
	const [fileBrowserDirFocus, setFileBrowserDirFocus] = useState<{
		dir: string;
		path: string;
	} | null>(null);
	const fileBrowserFocusedDirPath =
		fileBrowserDirFocus !== null &&
		fileBrowserDirFocus.dir === fileBrowserCurrentDir
			? fileBrowserDirFocus.path
			: "";
	const [fileBrowserError, setFileBrowserError] = useState<string | null>(null);
	const [fileBrowserFilter, setFileBrowserFilter] =
		useState<FileBrowserFilter>("all");
	const [fileBrowserHiddenExtensions, setFileBrowserHiddenExtensions] =
		useState<readonly string[]>([]);
	const [fileBrowserHiddenFileTypes, setFileBrowserHiddenFileTypes] = useState<
		readonly FileBrowserFileType[]
	>([]);
	const [
		fileBrowserCatalogHiddenPresetTypes,
		setFileBrowserCatalogHiddenPresetTypes,
	] = useState<readonly PresetType[]>([]);
	const [fileBrowserFiltersExpanded, setFileBrowserFiltersExpanded] =
		useState<boolean>(false);

	const [searchDraft, setSearchDraft] = useState("");
	const [pathDraft, setPathDraft] = useState("");
	const [anchorRows, setAnchorRows] = useState<readonly AnchorRow[]>([]);
	const audioPreviewRef = useRef<HTMLAudioElement | null>(null);
	const [_audioPreviewPath, setAudioPreviewPath] = useState<string | null>(
		null,
	);
	const refreshFileBrowserRef = useRef<(() => Promise<void>) | null>(null);
	const handleImportFileRef = useRef<((p: string) => Promise<void>) | null>(
		null,
	);
	// Latest-callback refs for the unified context-menu `browser-*` event
	// bridge. The listener effect below mounts once per widget, so handlers
	// that depend on navigation state must be read through refs.
	const handleGoUpRef = useRef<() => void>(() => {});
	const handleBrowseDrivesRef = useRef<() => void>(() => {});
	const playAudioPreviewRef = useRef<(filePath: string) => void>(() => {});

	// Create file browser service
	const fileBrowserService = useMemo(() => {
		if (typeof window !== "undefined" && canUseCepNodeFileBrowser(window)) {
			return createCepNodeFileBrowserService({ win: window });
		}
		return null;
	}, []);

	// Debounce search query
	useEffect(() => {
		const timer = setTimeout(() => {
			setFileBrowserQuery(searchDraft);
		}, 300);
		return () => clearTimeout(timer);
	}, [searchDraft]);

	// Initialize default directory and keep pathDraft in sync.
	useEffect(() => {
		if (fileBrowserService && !fileBrowserCurrentDir) {
			const dir = fileBrowserService.getDefaultDirectory();
			setFileBrowserCurrentDir(dir);
			setPathDraft(dir);
			return;
		}
		setPathDraft(fileBrowserCurrentDir);
	}, [fileBrowserService, fileBrowserCurrentDir]);

	// Audio preview control
	const stopAudioPreview = useCallback((): void => {
		if (audioPreviewRef.current) {
			audioPreviewRef.current.pause();
			audioPreviewRef.current = null;
		}
		setAudioPreviewPath(null);
	}, []);

	const playAudioPreview = useCallback(
		(filePath: string): void => {
			stopAudioPreview();
			const normalized = filePath.replace(/\\/g, "/");
			const url = /^[A-Za-z]:\//.test(normalized)
				? `file:///${encodeURI(normalized)}`
				: `file://${encodeURI(normalized)}`;
			const audio = new Audio(url);
			audioPreviewRef.current = audio;
			setAudioPreviewPath(filePath);
			audio.play().catch(() => {
				stopAudioPreview();
			});
		},
		[stopAudioPreview],
	);

	const _parseSettingsToRows = useCallback(
		(raw: string | null): AnchorRow[] => {
			const rows: AnchorRow[] = [
				{
					label: t("directoryBrowser.anchors.defaultUserData"),
					path: "",
					isDefault: true,
				},
			];
			if (raw) {
				const parsed = JSON.parse(raw) as {
					core?: {
						paths?: {
							presetRoot?: string;
							scriptRoot?: string;
							pluginRoot?: string;
						};
					};
				};
				const p = parsed.core?.paths;
				if (p?.presetRoot?.trim()) {
					rows.push({
						label: t("directoryBrowser.anchors.presetRoot"),
						path: p.presetRoot.trim(),
					});
				}
				if (p?.scriptRoot?.trim()) {
					rows.push({
						label: t("directoryBrowser.anchors.scriptRoot"),
						path: p.scriptRoot.trim(),
					});
				}
				if (p?.pluginRoot?.trim()) {
					rows.push({
						label: t("directoryBrowser.anchors.pluginRoot"),
						path: p.pluginRoot.trim(),
					});
				}
			}
			return rows;
		},
		[t],
	);

	const _buildDefaultAnchorRows = useCallback((): AnchorRow[] => {
		return [
			{
				label: t("directoryBrowser.anchors.defaultUserData"),
				path: "",
				isDefault: true,
			},
		];
	}, [t]);

	const loadAnchors = useCallback(async () => {
		try {
			const raw = await readSettings(window);
			setAnchorRows(_parseSettingsToRows(raw));
		} catch {
			setAnchorRows(_buildDefaultAnchorRows());
		}
	}, [_parseSettingsToRows, _buildDefaultAnchorRows]);

	useEffect(() => {
		void loadAnchors();
	}, [loadAnchors]);

	const refreshFileBrowser = useCallback(async () => {
		if (!fileBrowserService) return;
		setFileBrowserError(null);
		const dir =
			fileBrowserCurrentDir || fileBrowserService.getDefaultDirectory();
		try {
			if (fileBrowserCurrentDir !== dir) {
				setFileBrowserCurrentDir(dir);
			}
			if (dir.trim() === DRIVES_SENTINEL) {
				const { rows, error } = await loadWindowsDriveRows(window);
				const driveEntries: FileBrowserEntry[] = rows.map((r) => ({
					path: r.path,
					name: r.name,
					isDirectory: true,
					size: 0,
					modifiedAt: new Date(0).toISOString(),
					extension: "",
					fileType: "unknown",
				}));
				setFileBrowserEntries(driveEntries);
				setFileBrowserParentDir(null);
				setFileBrowserError(error);
				return;
			}
			const entries = await fileBrowserService.listDirectory(dir);
			setFileBrowserEntries(entries);
			const parent = fileBrowserService.getAncestorDirectoryOrNull(dir);
			setFileBrowserParentDir(parent);
		} catch (e) {
			setFileBrowserError(e instanceof Error ? e.message : String(e));
		}
	}, [fileBrowserService, fileBrowserCurrentDir]);

	useEffect(() => {
		refreshFileBrowserRef.current = refreshFileBrowser;
	}, [refreshFileBrowser]);

	const handleGoUp = useCallback(() => {
		const current = fileBrowserCurrentDir.trim();
		if (!current || current === DRIVES_SENTINEL) return;
		if (isAtDriveRoot(current)) {
			setFileBrowserCurrentDir(DRIVES_SENTINEL);
			return;
		}
		if (!fileBrowserService) return;
		const parent = fileBrowserService.getParentDirectory(current);
		if (parent && parent !== current) {
			setFileBrowserCurrentDir(parent);
		}
	}, [fileBrowserService, fileBrowserCurrentDir]);

	const handleBrowseDrives = useCallback(() => {
		setFileBrowserCurrentDir(DRIVES_SENTINEL);
	}, []);

	const handleSelectEntry = useCallback(
		(entry: { path: string; isDirectory: boolean }): void => {
			if (entry.isDirectory) {
				setFileBrowserDirFocus({
					dir: fileBrowserCurrentDir,
					path: entry.path,
				});
				setFileBrowserSelectedPath("");
			} else {
				setFileBrowserSelectedPath(entry.path);
				setFileBrowserDirFocus(null);
			}
		},
		[fileBrowserCurrentDir],
	);

	// `handleGoUp` already routes drive roots (e.g. "C:/") to the drive list,
	// so the "Go up" affordance must stay enabled at the drive root — the
	// user's mental model is "press up to climb to the drive list". We only
	// disable it when there is no current directory at all, or when we are
	// already sitting on the drive list.
	const canGoUpFromCurrent =
		Boolean(fileBrowserCurrentDir.trim()) &&
		fileBrowserCurrentDir.trim() !== DRIVES_SENTINEL;

	const getSearchDir = useCallback(
		() =>
			fileBrowserCurrentDir ||
			(fileBrowserService?.getDefaultDirectory() ?? ""),
		[fileBrowserCurrentDir, fileBrowserService],
	);

	const runSearch = useCallback(async () => {
		if (!fileBrowserService || !fileBrowserQuery) return;
		setFileBrowserError(null);
		try {
			const dir = getSearchDir();
			const results = await fileBrowserService.searchDirectory(
				dir,
				fileBrowserQuery,
			);
			setFileBrowserSearchEntries(results);
		} catch (e) {
			setFileBrowserError(e instanceof Error ? e.message : String(e));
		}
	}, [fileBrowserService, getSearchDir, fileBrowserQuery]);

	useEffect(() => {
		if (fileBrowserBrowseMode === "filesystem") {
			void refreshFileBrowser();
		}
	}, [fileBrowserBrowseMode, refreshFileBrowser]);

	useEffect(() => {
		if (
			fileBrowserBrowseMode === "filesystem" &&
			fileBrowserRecursiveSearch &&
			fileBrowserQuery
		) {
			void runSearch();
		}
	}, [
		fileBrowserBrowseMode,
		fileBrowserRecursiveSearch,
		fileBrowserQuery,
		runSearch,
	]);

	const importFile = useCallback(
		async (filePath: string): Promise<string> => {
			const hostCode = detectCepHostCode();
			const hostExecutorForAlign =
				hostCode === "AEFT"
					? createCepHostExecutor(window, "after-effects")
					: null;
			if (hostCode !== "AEFT" || !hostExecutorForAlign) {
				throw new Error(t("directoryBrowser.actions.fileImportAeOnly"));
			}
			const lowerPath = filePath.toLowerCase();
			const fileName = filePath.split(/[\\/]/).pop() ?? filePath;
			if (lowerPath.endsWith(".jsx") || lowerPath.endsWith(".jsxbin")) {
				await hostExecutorForAlign("runScriptFile", [filePath]);
				return t("directoryBrowser.actions.ranScript", {
					name: fileName,
					defaultValue: "Ran script: {{name}}",
				});
			}
			if (lowerPath.endsWith(".ffx")) {
				await hostExecutorForAlign("applyPreset", [filePath]);
				return t("directoryBrowser.actions.appliedPreset", {
					name: fileName,
					defaultValue: "Applied preset: {{name}}",
				});
			}
			if (lowerPath.endsWith(".aex") || lowerPath.endsWith(".plugin")) {
				// Look up the catalog matchName from the candidates cache. The
				// filename stem is NOT a reliable matchName — After Effects stores
				// matchName in the plugin's PICA resource, not the filename.
				const snapshot = getCandidatesSnapshot();
				const matchName = resolveEffectMatchName(
					filePath,
					snapshot?.pluginEffects ?? [],
				);
				await hostExecutorForAlign("applyEffectByMatchName", [matchName]);
				return t("directoryBrowser.actions.appliedEffect", {
					name: fileName,
					defaultValue: "Applied effect: {{name}}",
				});
			}
			await hostExecutorForAlign("addFootage", [{ filePath, toComp: true }]);
			return t("directoryBrowser.actions.importedFootage", {
				name: fileName,
				defaultValue: "Imported footage: {{name}}",
			});
		},
		[t],
	);

	const handleImportFile = useCallback(
		async (filePath: string) => {
			try {
				const msg = await importFile(filePath);
				notificationStore.add(msg, "info");
			} catch (error) {
				notificationStore.add(
					t("directoryBrowser.actions.importFailed", {
						message: error instanceof Error ? error.message : String(error),
					}) ||
						`File action failed: ${error instanceof Error ? error.message : String(error)}`,
					"error",
				);
			}
		},
		[importFile, t],
	);

	useEffect(() => {
		handleImportFileRef.current = handleImportFile;
	}, [handleImportFile]);

	const runPreset = useCallback(
		async (presetId: string) => {
			// Issue #130: if the boot-time asset scan flagged this preset
			// as `missing`, the underlying file is gone and running it
			// would only surface a confusing AE error. Block the run with
			// a user-visible notification instead. `unverifiable` is NOT
			// blocked: the file may still exist, we just couldn't reach
			// the host to confirm.
			if (isPresetAssetMissing(presetId)) {
				const blockedMsg =
					t("directoryBrowser.actions.runBlockedMissingAsset") ||
					"Preset asset is missing on disk; the run is disabled.";
				notificationStore.add(blockedMsg, "error");
				return;
			}
			const successMsg =
				t("directoryBrowser.actions.runSuccess", { presetId }) ||
				`Executed preset: ${presetId}`;
			try {
				const preset = await resolvePresetForRun(presetId, t);
				const hostCode = detectCepHostCode();
				await traceExecute(preset, "directory-browser:run", () =>
					executeWorkspacePresetForWindow(window, hostCode, preset),
				);
				notificationStore.add(successMsg, "info");
			} catch (e) {
				const errMsg = e instanceof Error ? e.message : String(e);
				const failedMsg =
					t("directoryBrowser.actions.runFailed", { message: errMsg }) ||
					`Preset failed: ${errMsg}`;
				notificationStore.add(failedMsg, "error");
			}
		},
		[t],
	);

	// Keep the context-menu bridge refs pointed at the latest callbacks.
	useEffect(() => {
		handleGoUpRef.current = handleGoUp;
		handleBrowseDrivesRef.current = handleBrowseDrives;
		playAudioPreviewRef.current = playAudioPreview;
	}, [handleGoUp, handleBrowseDrives, playAudioPreview]);

	// Listen for global unified context menu events. The workspace context
	// menu (unified-context-menu.ts) dispatches `browser-*` CustomEvents on
	// the panel root for directory-browser hits; see `handleUnifiedCtxSelect`
	// in management/workspace/hook.ts for the producer side.
	useEffect(() => {
		const root = widgetPanelRef.current?.closest(
			"[data-ty-workspace-panel-root]",
		);
		if (!root) return;

		const handleRefresh = () => {
			void refreshFileBrowserRef.current?.();
		};
		const handleGoUpEvent = () => {
			handleGoUpRef.current();
		};
		const handleBrowseDrivesEvent = () => {
			handleBrowseDrivesRef.current();
		};
		const handleClearSearch = () => {
			setSearchDraft("");
			setFileBrowserQuery("");
		};
		const handleAudioPreview = (ev: Event) => {
			const path = (ev as CustomEvent).detail?.["data-file-path"];
			if (typeof path === "string" && path.trim()) {
				playAudioPreviewRef.current(path.trim());
			}
		};
		const handleOpenDir = (ev: Event) => {
			const path = (ev as CustomEvent).detail?.["data-file-path"];
			if (typeof path === "string" && path.trim()) {
				setFileBrowserCurrentDir(path.trim());
			}
		};
		const handleToggleFilters = () => {
			setFileBrowserFiltersExpanded((prev) => !prev);
		};
		const handleSelect = (ev: Event) => {
			const path = (ev as CustomEvent).detail?.["data-file-path"];
			if (typeof path === "string" && path.trim()) {
				const trimmed = path.trim();
				// Select/Deselect toggle: the context menu emits the same
				// `browser-select` event for both directions.
				setFileBrowserSelectedPath((prev) => (prev === trimmed ? "" : trimmed));
				setFileBrowserDirFocus(null);
			}
		};
		const handleImport = (ev: Event) => {
			const path = (ev as CustomEvent).detail?.["data-file-path"];
			if (typeof path === "string" && path.trim()) {
				void handleImportFileRef.current?.(path.trim());
			}
		};
		const handleDefaultDir = () => {
			if (fileBrowserService) {
				setFileBrowserCurrentDir(fileBrowserService.getDefaultDirectory());
			}
		};
		const handleToggleHiddenExt = (ev: Event) => {
			const ext = (ev as CustomEvent).detail?.["data-file-ext"];
			if (typeof ext === "string" && ext.trim()) {
				const trimmed = ext.trim();
				setFileBrowserHiddenExtensions((prev) =>
					prev.includes(trimmed)
						? prev.filter((x) => x !== trimmed)
						: [...prev, trimmed],
				);
			}
		};
		const handleToggleHiddenFileType = (ev: Event) => {
			const ft = (ev as CustomEvent).detail?.["data-file-browser-file-type"];
			if (typeof ft === "string" && ft.trim()) {
				const trimmed = ft.trim() as FileBrowserFileType;
				setFileBrowserHiddenFileTypes((prev) =>
					prev.includes(trimmed)
						? prev.filter((x) => x !== trimmed)
						: [...prev, trimmed],
				);
			}
		};
		const handleToggleRecursive = () => {
			setFileBrowserRecursiveSearch((prev) => !prev);
		};
		const handleToggleCatalogPresetType = (ev: Event) => {
			const ct = (ev as CustomEvent).detail?.["data-catalog-preset-type"];
			if (typeof ct === "string" && ct.trim()) {
				const trimmed = ct.trim() as PresetType;
				setFileBrowserCatalogHiddenPresetTypes((prev) =>
					prev.includes(trimmed)
						? prev.filter((x) => x !== trimmed)
						: [...prev, trimmed],
				);
			}
		};
		const handleFilter = (ev: Event) => {
			const f = (ev as CustomEvent).detail?.["data-filter"];
			if (typeof f === "string" && f.trim()) {
				setFileBrowserFilter(f.trim() as FileBrowserFilter);
			}
		};

		root.addEventListener("browser-refresh", handleRefresh);
		root.addEventListener("browser-go-up", handleGoUpEvent);
		root.addEventListener("browser-browse-drives", handleBrowseDrivesEvent);
		root.addEventListener("browser-clear-search", handleClearSearch);
		root.addEventListener("browser-audio-preview", handleAudioPreview);
		root.addEventListener("browser-open-dir", handleOpenDir);
		root.addEventListener(
			"browser-toggle-directory-filters",
			handleToggleFilters,
		);
		root.addEventListener("browser-select", handleSelect);
		root.addEventListener("browser-import", handleImport);
		root.addEventListener("browser-default-dir", handleDefaultDir);
		root.addEventListener(
			"browser-toggle-hidden-extension",
			handleToggleHiddenExt,
		);
		root.addEventListener(
			"browser-toggle-hidden-file-type",
			handleToggleHiddenFileType,
		);
		root.addEventListener("browser-toggle-recursive", handleToggleRecursive);
		root.addEventListener(
			"browser-toggle-catalog-preset-type",
			handleToggleCatalogPresetType,
		);
		root.addEventListener("browser-filter", handleFilter);

		return () => {
			root.removeEventListener("browser-refresh", handleRefresh);
			root.removeEventListener("browser-go-up", handleGoUpEvent);
			root.removeEventListener(
				"browser-browse-drives",
				handleBrowseDrivesEvent,
			);
			root.removeEventListener("browser-clear-search", handleClearSearch);
			root.removeEventListener("browser-audio-preview", handleAudioPreview);
			root.removeEventListener("browser-open-dir", handleOpenDir);
			root.removeEventListener(
				"browser-toggle-directory-filters",
				handleToggleFilters,
			);
			root.removeEventListener("browser-select", handleSelect);
			root.removeEventListener("browser-import", handleImport);
			root.removeEventListener("browser-default-dir", handleDefaultDir);
			root.removeEventListener(
				"browser-toggle-hidden-extension",
				handleToggleHiddenExt,
			);
			root.removeEventListener(
				"browser-toggle-hidden-file-type",
				handleToggleHiddenFileType,
			);
			root.removeEventListener(
				"browser-toggle-recursive",
				handleToggleRecursive,
			);
			root.removeEventListener(
				"browser-toggle-catalog-preset-type",
				handleToggleCatalogPresetType,
			);
			root.removeEventListener("browser-filter", handleFilter);
		};
	}, [fileBrowserService]);

	const anchorRootsForPathField = useMemo(() => {
		const out: { label: string; path: string }[] = [];
		for (const r of anchorRows) {
			const p = r.path.trim();
			if (r.isDefault || !p) continue;
			out.push({ label: r.label, path: p });
		}
		return out;
	}, [anchorRows]);

	const fsRows: readonly FileBrowserEntry[] = useMemo(() => {
		const q = fileBrowserQuery.trim();
		if (
			fileBrowserBrowseMode === "filesystem" &&
			fileBrowserRecursiveSearch &&
			q
		) {
			return fileBrowserSearchEntries;
		}
		return fileBrowserEntries;
	}, [
		fileBrowserBrowseMode,
		fileBrowserEntries,
		fileBrowserSearchEntries,
		fileBrowserQuery,
		fileBrowserRecursiveSearch,
	]);

	const fsRowsWithParent = useMemo((): readonly FileBrowserEntry[] => {
		if (fileBrowserBrowseMode !== "filesystem") {
			return fsRows;
		}
		const p = fileBrowserParentDir;
		if (!p?.trim()) {
			return fsRows;
		}
		return [parentRow(p), ...fsRows];
	}, [fsRows, fileBrowserBrowseMode, fileBrowserParentDir]);

	const fsVisible = useMemo(() => {
		const q = fileBrowserQuery.trim().toLowerCase();
		const base =
			q && !fileBrowserRecursiveSearch
				? fsRowsWithParent.filter((e) => {
						if (e.name === ".." && e.isDirectory) {
							return true;
						}
						return (
							e.name.toLowerCase().includes(q) ||
							e.path.toLowerCase().includes(q)
						);
					})
				: [...fsRowsWithParent];

		const sidekickStemByParent =
			fileBrowserBrowseMode === "filesystem"
				? buildSidekickByParent(fsRows, state.presets)
				: null;

		const hideCompanionThumbRow = (e: FileBrowserEntry): boolean => {
			if (!sidekickStemByParent || !isCompanionThumbnailImageEntry(e)) {
				return false;
			}
			if (e.name === ".." && e.isDirectory) {
				return false;
			}
			const par = parentDirectoryOf(e.path);
			const stems = sidekickStemByParent.get(siblingPathKey(par));
			if (!stems) {
				return false;
			}
			return stems.has(stemWithoutExtension(e.path).toLowerCase());
		};

		return base.filter(
			(e) =>
				!hideCompanionThumbRow(e) &&
				entryMatchesCoarseFilter(e, fileBrowserFilter) &&
				entryPassesDetailFilters(
					e,
					fileBrowserHiddenFileTypes,
					fileBrowserHiddenExtensions,
				),
		);
	}, [
		fsRows,
		fsRowsWithParent,
		fileBrowserBrowseMode,
		state.presets,
		fileBrowserQuery,
		fileBrowserRecursiveSearch,
		fileBrowserFilter,
		fileBrowserHiddenFileTypes,
		fileBrowserHiddenExtensions,
	]);

	// Kit entries for the unified FileEntryList (filesystem mode only).
	// The ".." parent row is excluded: the kit renders its own up-tile.
	const fsKitEntries = useMemo((): FileEntry[] => {
		const out: FileEntry[] = [];
		for (const e of fsVisible) {
			if (e.name === ".." && e.isDirectory) {
				continue;
			}
			out.push({
				path: e.path,
				name: e.name,
				isDirectory: e.isDirectory,
				isPackage: e.isPackage,
				fileType: e.fileType,
				extension: e.extension,
				previewUrl: e.previewUrl,
			});
		}
		return out;
	}, [fsVisible]);

	const fsEntryByPath = useMemo(
		() => new Map(fsVisible.map((e) => [e.path, e] as const)),
		[fsVisible],
	);

	const fsUpLabel = isAtDriveRoot(fileBrowserCurrentDir)
		? t("directoryBrowser.entry.browseDrives")
		: t("directoryBrowser.entry.parentRowName");

	const catalogPresets = useMemo(() => {
		const dir = fileBrowserCurrentDir.trim();
		if (!dir) {
			return [];
		}
		const hidden = new Set(fileBrowserCatalogHiddenPresetTypes);
		return state.presets.filter((p: Preset) => {
			if (!presetFileInCurrentDir(p.filePath, dir)) {
				return false;
			}
			if (hidden.has(p.type)) {
				return false;
			}
			return matchesPresetQuery(p, fileBrowserQuery);
		});
	}, [
		state.presets,
		fileBrowserCurrentDir,
		fileBrowserCatalogHiddenPresetTypes,
		fileBrowserQuery,
	]);

	const [catalogGroups, setCatalogGroups] = useState<readonly GroupEntry[]>([]);
	useEffect(() => {
		let cancelled = false;
		const loadGroups = async (): Promise<void> => {
			if (typeof window === "undefined") {
				return;
			}
			try {
				const raw = await readGroupJson(window);
				if (cancelled) {
					return;
				}
				setCatalogGroups(parseGroupFromText(raw));
			} catch {
				if (!cancelled) {
					setCatalogGroups([]);
				}
			}
		};
		void loadGroups();
		return () => {
			cancelled = true;
		};
	}, []);

	const partitionedCatalog = useMemo(() => {
		return partitionCatalogPresetsByGroup(catalogPresets, catalogGroups);
	}, [catalogPresets, catalogGroups]);

	const showUngroupedSection =
		partitionedCatalog.ungrouped.length > 0 &&
		(partitionedCatalog.grouped.length > 0
			? state.presets.length !== partitionedCatalog.ungrouped.length
			: true);

	const searchInlineTrailing = useMemo((): ReactNode => {
		const n =
			fileBrowserBrowseMode === "presetsCatalog"
				? catalogPresets.length
				: fsVisible.length;
		const q = fileBrowserQuery.trim();
		const key = q
			? "directoryBrowser.search.resultsCountFiltered"
			: "directoryBrowser.search.resultsCount";
		return (
			<span
				className={css({ flexShrink: 0, fontVariantNumeric: "tabular-nums" })}
			>
				{t(key, { count: n })}
			</span>
		);
	}, [
		fsVisible.length,
		catalogPresets.length,
		fileBrowserQuery,
		fileBrowserBrowseMode,
		t,
	]);

	const err = fileBrowserError?.trim();
	const empty =
		fileBrowserBrowseMode === "presetsCatalog"
			? catalogPresets.length === 0
			: fileBrowserBrowseMode === "anchors"
				? anchorRows.length === 0
				: fsVisible.length === 0;

	const clearSearchAndNotifyWorkspace = (): void => {
		setSearchDraft("");
		setFileBrowserQuery("");
	};

	const browseModeOptions = useMemo(
		() =>
			(
				[
					["filesystem", "directoryBrowser.browseMode.filesystem"],
					["anchors", "directoryBrowser.browseMode.anchors"],
					["presetsCatalog", "directoryBrowser.browseMode.presetsCatalog"],
				] as const
			).map(([value, key]) => ({
				value,
				label: t(key),
			})),
		[t],
	);

	const thumbnailListDirectory = useMemo(() => {
		if (typeof window === "undefined") {
			return undefined;
		}
		if (!isCep || !canUseCepNodeFileBrowser(window)) {
			return undefined;
		}
		try {
			const svc = createCepNodeFileBrowserService({ win: window });
			return (dirPath: string) => {
				const key = siblingPathKey(dirPath);
				const existing = thumbListInflight.current.get(key);
				if (existing) {
					return existing;
				}
				const p: Promise<readonly FileBrowserEntry[]> = svc
					.listDirectory(dirPath)
					.then((r: readonly FileBrowserEntry[]) => r);
				thumbListInflight.current.set(key, p);
				void p.finally(() => {
					thumbListInflight.current.delete(key);
				});
				return p;
			};
		} catch {
			return undefined;
		}
	}, [isCep]);

	const siblingHintParentDir = fileBrowserCurrentDir.trim() || null;
	const siblingHintEntries = fileBrowserEntries;

	const presetGlyphSiblingProps = useMemo(
		() => ({
			siblingHintParentDir,
			siblingHintEntries,
			thumbnailListDirectory,
		}),
		[siblingHintParentDir, siblingHintEntries, thumbnailListDirectory],
	);

	const applyBrowseMode = (nextRaw: string): void => {
		const next = nextRaw.trim();
		if (
			next !== "filesystem" &&
			next !== "anchors" &&
			next !== "presetsCatalog"
		) {
			return;
		}
		setFileBrowserBrowseMode(next);
	};

	const commitPathDraft = useCallback((): void => {
		const trimmed = pathDraft.trim();
		if (!trimmed) {
			return;
		}
		setFileBrowserCurrentDir(trimmed);
	}, [pathDraft]);

	const openFolderPicker = useCallback((): void => {
		const startDir =
			fileBrowserCurrentDir ||
			(fileBrowserService ? fileBrowserService.getDefaultDirectory() : "");
		selectFolder(
			startDir,
			t("directoryBrowser.path.pickFolderPrompt"),
			(result) => {
				if (result?.trim()) {
					setFileBrowserCurrentDir(result.trim());
				}
			},
		);
	}, [t, fileBrowserCurrentDir, fileBrowserService]);

	const openAnchorOrDefault = useCallback(
		(row: { isDefault?: boolean; path: string }): void => {
			if (row.isDefault) {
				if (fileBrowserService) {
					setFileBrowserCurrentDir(fileBrowserService.getDefaultDirectory());
				}
			} else if (row.path.trim()) {
				setFileBrowserCurrentDir(row.path.trim());
			}
		},
		[fileBrowserService],
	);

	const activateCatalogPresetRow = useCallback((filePath: string): void => {
		setFileBrowserSelectedPath(filePath);
		setFileBrowserDirFocus(null);
	}, []);

	const iconToolBtnBase = css({
		height: "full",
		minHeight: 0,
		width: "8",
		flexShrink: 0,
		alignSelf: "stretch",
		borderRadius: "shell-sm",
		borderWidth: "1px",
		borderStyle: "solid",
		borderColor: "border.default",
		backgroundColor: "surface.widget",
		opacity: 0.5,
		padding: 0,
		color: "text.muted",
		_hover: { color: "text.primary" },
	});
	const iconToolBtnActive = css({
		borderColor: "border.strong",
		backgroundColor: "surface.widget",
		opacity: 1,
		color: "text.primary",
	});

	return (
		<div
			ref={widgetPanelRef}
			// Read by the unified workspace context menu
			// (parseDirectoryBrowserHit) for Go up enabled-state and the
			// Select/Deselect label on file rows.
			data-directory-browser-can-go-up={canGoUpFromCurrent ? "true" : "false"}
			data-directory-browser-selected-file={fileBrowserSelectedPath}
			className={css({
				display: "flex",
				height: "full",
				minHeight: 0,
				width: "full",
				minWidth: 0,
				flexDirection: "column",
				overflow: "hidden",
				backgroundColor: "surface.dialog",
			})}
		>
			<CatalogBrowserShell
				domPrefix="directory-browser"
				scrollMode="list-only"
				headerRow={
					<div
						className={css({
							display: "flex",
							minWidth: 0,
							flexDirection: "column",
							gap: "2.5",
						})}
					>
						<div
							className={css({
								display: "flex",
								minWidth: 0,
								alignItems: "stretch",
								gap: "2",
							})}
						>
							<div
								className={css({
									display: "flex",
									minHeight: 0,
									minWidth: 0,
									flex: "1",
									flexDirection: "column",
									gap: "2.5",
								})}
							>
								<div
									data-directory-browser-search
									className={css({ minHeight: 0, minWidth: 0 })}
								>
									<SearchField
										uiSize="md"
										className={css({ minWidth: 0 })}
										icon={Search}
										inputRef={searchInputRef}
										placeholder={
											fileBrowserBrowseMode === "presetsCatalog"
												? t("directoryBrowser.search.placeholderCatalog")
												: t("directoryBrowser.search.placeholderFolder")
										}
										value={searchDraft}
										onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
											setSearchDraft(e.currentTarget.value);
										}}
										showClearButton
										onClear={clearSearchAndNotifyWorkspace}
										showInlineTrailing
										inlineTrailing={searchInlineTrailing}
									/>
								</div>
								<PathField
									value={formatPathForMode(
										fileBrowserBrowseMode,
										pathDraft,
										anchorRootsForPathField,
									)}
									onChange={setPathDraft}
									onBrowse={
										isCep &&
										typeof window !== "undefined" &&
										canUseCepNodeFileBrowser(window)
											? openFolderPicker
											: undefined
									}
									browseSlot={<Icon icon={FolderOpen} size={12} />}
									browseAriaLabel={t("directoryBrowser.path.pickFolderAria")}
									placeholder={t("directoryBrowser.path.inputPlaceholder")}
									uiSize="md"
									className={css({ minWidth: 0 })}
									inputProps={{
										title: t("directoryBrowser.path.inputTitle"),
										onKeyDown: (
											e: React.KeyboardEvent<HTMLInputElement>,
										): void => {
											if (isIMEComposing(e)) return;
											if (e.key === "Enter") {
												e.preventDefault();
												commitPathDraft();
											}
										},
									}}
								/>
							</div>
							<div
								className={css({
									display: "flex",
									minHeight: 0,
									flexShrink: 0,
									flexDirection: "column",
									gap: "2.5",
									alignSelf: "stretch",
								})}
							>
								{renderToolbar({
									goUpAvailable: canGoUpFromCurrent,
									filtersExpanded: fileBrowserFiltersExpanded,
									onRefresh: () => {
										void refreshFileBrowser();
									},
									onGoUp: handleGoUp,
									onBrowseDrives: handleBrowseDrives,
									onToggleFilters: () =>
										setFileBrowserFiltersExpanded((prev) => !prev),
									viewMode,
									onViewModeChange: setViewMode,
									detailedFiltersLabel: t(
										"directoryBrowser.toolbar.detailedFilters",
									),
									listViewAriaLabel: t("directoryBrowser.toolbar.listView"),
									iconViewAriaLabel: t("directoryBrowser.toolbar.iconView"),
									viewModeLegend: t("directoryBrowser.toolbar.viewModeLegend"),
									refreshLabel: t("directoryBrowser.toolbar.refresh"),
									goUpLabel: t("directoryBrowser.entry.goUp"),
									browseDrivesLabel: t("directoryBrowser.entry.browseDrives"),
								})}
								<ListSelect
									className={css({ minWidth: 0 })}
									uiSize="sm"
									value={fileBrowserBrowseMode}
									options={
										browseModeOptions as {
											value: string;
											label: string;
										}[]
									}
									onChange={(next: string) =>
										applyBrowseMode(next as FileBrowserBrowseMode)
									}
									aria-label={t("directoryBrowser.browseModeSelectAria")}
								/>
							</div>
						</div>
						{fileBrowserFiltersExpanded ? (
							<div
								className={css({
									display: "flex",
									minWidth: 0,
									flexDirection: "column",
									gap: "2",
									borderRadius: "shell-sm",
									borderWidth: "1px",
									borderStyle: "solid",
									borderColor: "border.default",
									backgroundColor: "surface.widget",
									opacity: 0.4,
									padding: "2",
								})}
							>
								{renderFilterPanel({
									browseMode: fileBrowserBrowseMode,
									coarseFilter: fileBrowserFilter,
									onCoarseFilterChange: setFileBrowserFilter,
									hiddenExtensions: fileBrowserHiddenExtensions,
									onToggleHiddenExtension: (ext: string) =>
										setFileBrowserHiddenExtensions((prev) =>
											prev.includes(ext)
												? prev.filter((x) => x !== ext)
												: [...prev, ext],
										),
									hiddenFileTypes: fileBrowserHiddenFileTypes,
									onToggleHiddenFileType: (ft: FileBrowserFileType) =>
										setFileBrowserHiddenFileTypes((prev) =>
											prev.includes(ft)
												? prev.filter((x) => x !== ft)
												: [...prev, ft],
										),
									catalogHiddenPresetTypes: fileBrowserCatalogHiddenPresetTypes,
									onToggleCatalogHiddenPresetType: (pt: PresetType) =>
										setFileBrowserCatalogHiddenPresetTypes((prev) =>
											prev.includes(pt)
												? prev.filter((x) => x !== pt)
												: [...prev, pt],
										),
									recursiveSearch: fileBrowserRecursiveSearch,
									onToggleRecursiveSearch: () =>
										setFileBrowserRecursiveSearch((prev) => !prev),
									typeListLabel: t("directoryBrowser.filters.typeList"),
									quickFilterAriaLabel: t(
										"directoryBrowser.filters.quickFilterAria",
									),
									optionAllLabel: t("directoryBrowser.filters.optionAll"),
									optionMediaLabel: t("directoryBrowser.filters.optionMedia"),
									optionPresetsLabel: t(
										"directoryBrowser.filters.optionPresets",
									),
									optionScriptsLabel: t(
										"directoryBrowser.filters.optionScripts",
									),
									optionFontsLabel: t("directoryBrowser.filters.optionFonts"),
									extensionHideLabel: t(
										"directoryBrowser.filters.extensionHide",
									),
									fileTypeHideLabel: t("directoryBrowser.filters.fileTypeHide"),
									catalogPresetTypesHideLabel: t(
										"directoryBrowser.filters.catalogPresetTypesHide",
									),
									anchorsNoFiltersLabel: t(
										"directoryBrowser.filters.anchorsNoFilters",
									),
									recursiveSearchLabel: (state: string) =>
										t("directoryBrowser.filters.recursiveSearch", { state }),
									recursiveOnLabel: t("directoryBrowser.filters.recursiveOn"),
									recursiveOffLabel: t("directoryBrowser.filters.recursiveOff"),
								})}
							</div>
						) : null}
					</div>
				}
			>
				{err ? <p className={emptyStateErrorClass}>{err}</p> : null}
				{fileBrowserBrowseMode === "presetsCatalog" &&
				!fileBrowserCurrentDir.trim() ? (
					<p
						className={css({
							borderRadius: "shell-sm",
							borderWidth: "1px",
							borderStyle: "dashed",
							borderColor: "border.default",
							backgroundColor: "surface.widget",
							opacity: 0.3,
							paddingInline: "2",
							paddingBlock: "2",
							fontSize: "text-xs",
							color: "text.muted",
						})}
					>
						{t("directoryBrowser.empty.catalogNeedsFolder")}
					</p>
				) : null}
				{fileBrowserBrowseMode === "anchors" ? (
					empty && !err ? (
						<p className={emptyStateClass}>
							{t("directoryBrowser.empty.noAnchors")}
						</p>
					) : viewMode === "list" ? (
						<ul className={fileListClass}>
							{anchorRows.map((row) => (
								<li
									key={row.label + row.path}
									className={css({
										backgroundColor: "surface.dialog",
										_hover: { backgroundColor: "interactive.hover" },
									})}
								>
									<AnchorRowButton
										label={row.label}
										subtitle={
											row.isDefault
												? t("directoryBrowser.entry.defaultFolderSubtitle")
												: row.path
										}
										entryPath={row.isDefault ? "" : row.path}
										onActivate={() => {
											openAnchorOrDefault(row);
										}}
									/>
								</li>
							))}
						</ul>
					) : (
						<div
							ref={iconGridHostRef}
							data-directory-browser-icon-view
							className={css({ minWidth: 0 })}
							style={
								{
									"--preset-icon-cell": `${ICON_CELL_BASE_REM * iconGridScale}rem`,
								} as CSSProperties
							}
							title={t("directoryBrowser.hints.iconGridWheel")}
						>
							<div className={ICON_GRID_CLASS}>
								{anchorRows.map((row) => (
									<div
										key={row.label + row.path}
										className={css({
											position: "relative",
											display: "flex",
											minHeight: 0,
											minWidth: 0,
											flexDirection: "column",
											overflow: "hidden",
											borderRadius: "shell-sm",
											borderWidth: "1px",
											borderStyle: "solid",
											borderColor: "border.default",
											backgroundColor: "surface.widget",
											_hover: { backgroundColor: "interactive.hover" },
										})}
										data-directory-browser-entry
										data-entry-kind="dir"
										data-entry-path={row.isDefault ? "" : row.path}
									>
										<Button
											type="button"
											variant="bare"
											uiSize="sm"
											fullWidth
											style={{ height: "auto" }}
											className={css({
												display: "flex",
												textAlign: "left",
											})}
											onDoubleClick={() => {
												openAnchorOrDefault(row);
											}}
											onKeyDown={(ev) => {
												if (isIMEComposing(ev)) return;
												if (ev.key !== "Enter") {
													return;
												}
												ev.preventDefault();
												openAnchorOrDefault(row);
											}}
											title={row.isDefault ? row.label : row.path}
										>
											<div
												className={css({
													display: "flex",
													height: "full",
													width: "full",
													alignItems: "center",
													justifyContent: "center",
													padding: "1",
												})}
											>
												<Icon
													icon={FolderOpen}
													size={40}
													className={css({
														maxHeight: "78%",
														maxWidth: "78%",
														flexShrink: 0,
														color: "text.muted",
													})}
													aria-hidden
												/>
											</div>
										</Button>
										<div
											className={css({
												marginTop: "0.5",
												minWidth: 0,
												paddingInline: "0.5",
											})}
										>
											<div
												className={css({
													truncate: true,
													textAlign: "left",
													fontSize: "shell-text-sm",
													fontWeight: "medium",
													lineHeight: "tight",
													color: "text.primary",
												})}
											>
												{row.label}
											</div>
											<div
												className={css({
													truncate: true,
													textAlign: "left",
													fontSize: "text-xs",
													color: "text.muted",
												})}
											>
												{row.isDefault
													? t("directoryBrowser.entry.defaultFolderSubtitle")
													: row.path}
											</div>
										</div>
									</div>
								))}
							</div>
						</div>
					)
				) : fileBrowserBrowseMode === "presetsCatalog" ? (
					empty && !err ? (
						<p className={emptyStateClass}>
							{t("directoryBrowser.empty.noCatalogPresets")}
						</p>
					) : (
						<div
							className={css({
								display: "flex",
								width: "full",
								minWidth: 0,
								flexDirection: "column",
								gap: "2",
							})}
						>
							{partitionedCatalog.grouped.map((g: GroupedCatalogPresets) =>
								viewMode === "list" ? (
									<CollapsibleGroupHeader
										key={g.group.id}
										title={g.group.title}
										count={g.presets.length}
									>
										<ul className={fileListClass}>
											{g.presets.map((p: Preset) => (
												<PresetListRow
													key={p.id}
													preset={p}
													presetGlyphSiblingProps={presetGlyphSiblingProps}
													activateCatalogPresetRow={activateCatalogPresetRow}
													runPreset={runPreset}
													actionsRunLabel={t("directoryBrowser.actions.run")}
													actionsRunBlockedMissingLabel={t(
														"directoryBrowser.actions.runBlockedMissingAsset",
													)}
													actionsRunBlockedUnverifiableLabel={t(
														"directoryBrowser.actions.runBlockedUnverifiableAsset",
													)}
												/>
											))}
										</ul>
									</CollapsibleGroupHeader>
								) : (
									<CollapsibleGroupHeader
										key={g.group.id}
										title={g.group.title}
										count={g.presets.length}
									>
										<div
											ref={iconGridHostRef}
											data-directory-browser-icon-view
											className={css({ minWidth: 0 })}
											style={
												{
													"--preset-icon-cell": `${ICON_CELL_BASE_REM * iconGridScale}rem`,
												} as CSSProperties
											}
											title={t("directoryBrowser.hints.iconGridWheel")}
										>
											<div className={ICON_GRID_CLASS}>
												{g.presets.map((p: Preset) => (
													<PresetIconTile
														key={p.id}
														preset={p}
														iconTileAspect={iconTileAspect}
														presetGlyphSiblingProps={presetGlyphSiblingProps}
														setFileBrowserSelectedPath={
															setFileBrowserSelectedPath
														}
														runPreset={runPreset}
														actionsRunLabel={t("directoryBrowser.actions.run")}
														actionsRunBlockedMissingLabel={t(
															"directoryBrowser.actions.runBlockedMissingAsset",
														)}
														actionsRunBlockedUnverifiableLabel={t(
															"directoryBrowser.actions.runBlockedUnverifiableAsset",
														)}
													/>
												))}
											</div>
										</div>
									</CollapsibleGroupHeader>
								),
							)}
							{showUngroupedSection ? (
								partitionedCatalog.ungrouped.length > 0 &&
								partitionedCatalog.grouped.length > 0 ? (
									<CollapsibleGroupHeader
										key="__ungrouped__"
										title={t("directoryBrowser.catalog.ungroupedHeading")}
										count={partitionedCatalog.ungrouped.length}
									>
										{viewMode === "list" ? (
											<ul className={fileListClass}>
												{partitionedCatalog.ungrouped.map((p: Preset) => (
													<PresetListRow
														key={p.id}
														preset={p}
														presetGlyphSiblingProps={presetGlyphSiblingProps}
														activateCatalogPresetRow={activateCatalogPresetRow}
														runPreset={runPreset}
														actionsRunLabel={t("directoryBrowser.actions.run")}
														actionsRunBlockedMissingLabel={t(
															"directoryBrowser.actions.runBlockedMissingAsset",
														)}
														actionsRunBlockedUnverifiableLabel={t(
															"directoryBrowser.actions.runBlockedUnverifiableAsset",
														)}
													/>
												))}
											</ul>
										) : (
											<div
												ref={iconGridHostRef}
												data-directory-browser-icon-view
												className={css({ minWidth: 0 })}
												style={
													{
														"--preset-icon-cell": `${ICON_CELL_BASE_REM * iconGridScale}rem`,
													} as CSSProperties
												}
												title={t("directoryBrowser.hints.iconGridWheel")}
											>
												<div className={ICON_GRID_CLASS}>
													{partitionedCatalog.ungrouped.map((p: Preset) => (
														<PresetIconTile
															key={p.id}
															preset={p}
															iconTileAspect={iconTileAspect}
															presetGlyphSiblingProps={presetGlyphSiblingProps}
															setFileBrowserSelectedPath={
																setFileBrowserSelectedPath
															}
															runPreset={runPreset}
															actionsRunLabel={t(
																"directoryBrowser.actions.run",
															)}
															actionsRunBlockedMissingLabel={t(
																"directoryBrowser.actions.runBlockedMissingAsset",
															)}
															actionsRunBlockedUnverifiableLabel={t(
																"directoryBrowser.actions.runBlockedUnverifiableAsset",
															)}
														/>
													))}
												</div>
											</div>
										)}
									</CollapsibleGroupHeader>
								) : viewMode === "list" ? (
									<ul className={fileListClass}>
										{partitionedCatalog.ungrouped.map((p: Preset) => (
											<PresetListRow
												key={p.id}
												preset={p}
												presetGlyphSiblingProps={presetGlyphSiblingProps}
												activateCatalogPresetRow={activateCatalogPresetRow}
												runPreset={runPreset}
												actionsRunLabel={t("directoryBrowser.actions.run")}
												actionsRunBlockedMissingLabel={t(
													"directoryBrowser.actions.runBlockedMissingAsset",
												)}
												actionsRunBlockedUnverifiableLabel={t(
													"directoryBrowser.actions.runBlockedUnverifiableAsset",
												)}
											/>
										))}
									</ul>
								) : (
									<div
										ref={iconGridHostRef}
										data-directory-browser-icon-view
										className={css({ minWidth: 0 })}
										style={
											{
												"--preset-icon-cell": `${ICON_CELL_BASE_REM * iconGridScale}rem`,
											} as CSSProperties
										}
										title={t("directoryBrowser.hints.iconGridWheel")}
									>
										<div className={ICON_GRID_CLASS}>
											{partitionedCatalog.ungrouped.map((p: Preset) => (
												<PresetIconTile
													key={p.id}
													preset={p}
													iconTileAspect={iconTileAspect}
													presetGlyphSiblingProps={presetGlyphSiblingProps}
													setFileBrowserSelectedPath={
														setFileBrowserSelectedPath
													}
													runPreset={runPreset}
													actionsRunLabel={t("directoryBrowser.actions.run")}
													actionsRunBlockedMissingLabel={t(
														"directoryBrowser.actions.runBlockedMissingAsset",
													)}
													actionsRunBlockedUnverifiableLabel={t(
														"directoryBrowser.actions.runBlockedUnverifiableAsset",
													)}
												/>
											))}
										</div>
									</div>
								)
							) : null}
						</div>
					)
				) : empty && !err ? (
					<p className={emptyStateClass}>
						{t("directoryBrowser.empty.noItems")}
					</p>
				) : (
					<div
						ref={iconGridHostRef}
						onWheel={onCardZoomWheel}
						className={css({ minWidth: 0 })}
						style={{ "--ty-card-zoom-size": `${cardSize}px` } as CSSProperties}
					>
						<FileEntryList
							entries={fsKitEntries}
							loading={false}
							canGoUp={canGoUpFromCurrent}
							onGoUp={handleGoUp}
							onEntryClick={handleSelectEntry}
							onEntrySelect={handleSelectEntry}
							onEntryActivate={(entry) => {
								if (entry.isDirectory) {
									setFileBrowserCurrentDir(entry.path);
								} else {
									handleSelectEntry(entry);
								}
							}}
							selectionMode="both"
							isSelected={(path, kind) =>
								isFileSelected(path) ||
								fileBrowserSelectedPath === path ||
								(kind === "folder" && fileBrowserFocusedDirPath === path)
							}
							onToggleSelected={(path) => toggleFileSelected(path)}
							activePath={fileBrowserFocusedDirPath || fileBrowserSelectedPath}
							selectedSummary={null}
							viewMode={viewMode}
							onViewModeChange={setViewMode}
							scale={iconGridScale * (cardSize / DEFAULT_CARD_SIZE)}
							aspect={iconTileAspect}
							cellBaseRem={ICON_CELL_BASE_REM}
							showViewToggle={false}
							upLabel={fsUpLabel}
							emptyLabel={t("directoryBrowser.empty.noItems")}
							renderTile={(entry) => {
								const f = fsEntryByPath.get(entry.path);
								const media = f ? (
									<EntryThumb
										entry={f}
										siblingSourceEntries={fsRows}
										glyphSize={48}
										glyphClassName={css({
											maxHeight: "85%",
											maxWidth: "85%",
											flexShrink: 0,
											color: "text.muted",
										})}
									/>
								) : null;
								const overlay = entry.isDirectory ? (
									<IconButton
										type="button"
										variant="default"
										size="xs"
										className={css({
											position: "absolute",
											right: "1",
											bottom: "1",
										})}
										onClick={(ev) => {
											ev.stopPropagation();
										}}
										aria-label={t("directoryBrowser.actions.openEntry")}
									>
										<Icon icon={FolderOpen} size={11} />
									</IconButton>
								) : (
									<IconButton
										type="button"
										variant="default"
										size="xs"
										className={css({
											position: "absolute",
											right: "1",
											bottom: "1",
										})}
										onClick={() => {
											void handleImportFile(entry.path);
										}}
										aria-label={t("directoryBrowser.actions.importOnly")}
									>
										<Icon icon={Play} size={11} />
									</IconButton>
								);
								return { media, overlay };
							}}
							renderRow={(entry) => {
								const f = fsEntryByPath.get(entry.path);
								const icon = f ? (
									<span
										className={css({
											display: "flex",
											height: "7",
											width: "7",
											flexShrink: 0,
											alignItems: "center",
											justifyContent: "center",
											overflow: "hidden",
											borderRadius: "shell-sm",
											borderWidth: "1px",
											borderStyle: "solid",
											borderColor: "border.default",
											backgroundColor: "surface.widget",
											color: "text.muted",
										})}
									>
										<EntryThumb
											entry={f}
											siblingSourceEntries={fsRows}
											glyphSize={14}
											glyphClassName={css({ flexShrink: 0 })}
										/>
									</span>
								) : null;
								const trailing = entry.isDirectory ? (
									<IconButton
										type="button"
										variant="default"
										size="sm"
										onClick={(ev) => {
											ev.stopPropagation();
											setFileBrowserCurrentDir(entry.path);
										}}
										aria-label={t("directoryBrowser.actions.openFolder")}
										title={t("directoryBrowser.actions.openFolder")}
									>
										<Icon icon={FolderOpen} size={12} />
									</IconButton>
								) : (
									<IconButton
										type="button"
										variant="default"
										size="sm"
										onClick={() => {
											void handleImportFile(entry.path);
										}}
										aria-label={t("directoryBrowser.actions.importRun")}
										title={t("directoryBrowser.actions.importRun")}
									>
										<Icon icon={Play} size={12} />
									</IconButton>
								);
								return { icon, trailing };
							}}
							listHeader={
								<div aria-hidden className={listHeaderClass}>
									<span
										className={css({ height: "7", width: "7", flexShrink: 0 })}
									/>
									<span className={listHeaderNameClass}>
										{t("directoryBrowser.listHeader.name")}
									</span>
									<span
										className={css({ height: "5", width: "5", flexShrink: 0 })}
										aria-hidden
									/>
									<span className={css({ width: "7", flexShrink: 0 })} />
								</div>
							}
						/>
					</div>
				)}
			</CatalogBrowserShell>
		</div>
	);
}

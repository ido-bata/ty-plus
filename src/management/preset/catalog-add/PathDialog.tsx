import { FileSearch, Save } from "lucide-react";
import {
	type JSX,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { selectFile } from "@/management/ae/cep/dialog-shim/bolt";
import { DialogShell } from "@/management/dialog";
import { DialogFooterActions } from "@/management/dialog/dialogs/shell/Footer";
import { useDialogClose } from "@/management/dialog/useClose";
import { createPresetFromFile } from "@/management/preset/authoring/request";
import { ArchiveDetailsSection } from "@/management/preset/catalog-add/ArchiveDetailsSection";
import {
	createArchiveIconDraft,
	iconDraftToPresetIcon,
} from "@/management/preset/catalog-add/archive-icon";
import type { ArchiveListRow } from "@/management/preset/catalog-add/archive-load-entries";
import { loadArchiveRows } from "@/management/preset/catalog-add/archive-load-entries";
import {
	normalizeFsPath,
	PRESET_ADD_DRIVES_PATH,
	type PresetAddFolderType,
} from "@/management/preset/catalog-add/archive-types";
import { readUserHomeOrFallback } from "@/management/preset/catalog-add/browse-start-dir";
import { parseRootPathsFromSettingsJson } from "@/management/preset/catalog-add/parse-root-paths";
import { verifyAndUpsertPreset } from "@/management/preset/catalog-add/verify-and-upsert";
import { PresetIconEditor } from "@/management/preset/components/IconEditor";
import type { Preset } from "@/management/preset/contract";
import { tracePresetLifecycle } from "@/management/preset/execution/lifecycle-trace";
import { FramedPresetGlyph } from "@/management/preset/workspace/glyph";
import {
	canUseCepNodeFileBrowser,
	createCepNodeFileBrowserService,
} from "@/management/storage/file-browser-service";
import { createLocalPresetCatalogId } from "@/management/storage/ids";
import { assertOpaqueId } from "@/management/storage/ids.assert";
import type { DirectoryBrowserEntry } from "@/management/storage/ui/DirectoryBrowser";
import { DirectoryBrowser } from "@/management/storage/ui/DirectoryBrowser";
import { readSettings } from "@/management/workspace/persistence/store";
import { notifyPanelsAfterPresetSave } from "@/management/workspace/placement/notify-panels-after-preset-save";
import { Icon } from "@/shared/component";
import { Button } from "@/shared/component/controls/Button";
import { Input } from "@/shared/component/fields/Input";
import { PathField } from "@/shared/component/fields/PathField";
import { DialogBody } from "@/shared/component/shell/DialogBody";
import { css, cx } from "@/styled-system/css";

const derivePresetNameFromFilePath = (path: string): string => {
	const base = path.split(/[/\\]/).pop() ?? "";
	return base.replace(/\.[^/.]+$/, "");
};

type DroppedFile = {
	path: string;
	name: string;
	isDirectory: boolean;
};

const FOLDER_TABS: { id: PresetAddFolderType; label: string }[] = [
	{ id: "presets", label: "Presets" },
	{ id: "scripts", label: "Scripts" },
	{ id: "plugins", label: "Plug-ins" },
	{ id: "other", label: "Other" },
];

const rootPathForTab = (
	roots: { presetRoot: string; scriptRoot: string; pluginRoot: string },
	tab: PresetAddFolderType,
): string => {
	if (tab === "presets") return roots.presetRoot;
	if (tab === "scripts") return roots.scriptRoot;
	if (tab === "plugins") return roots.pluginRoot;
	return "";
};

const folderTabBaseClass = css({
	height: "7",
	minWidth: "0",
	flex: "1",
	borderRadius: "shell-sm",
	paddingInline: "2",
	fontSize: "shell-text-sm",
	lineHeight: "tight",
	transitionProperty: "colors",
});

const folderTabActiveClass = css({
	backgroundColor: "text.accent",
	color: "surface.panel",
	boxShadow: "sm",
});

const folderTabInactiveClass = css({
	backgroundColor: "surface.widget",
	color: "text.muted",
	_hover: {
		backgroundColor: "interactive.hover",
		color: "text.primary",
	},
});

const FOLDER_TAB_CLASS = (active: boolean): string =>
	cx(
		folderTabBaseClass,
		active ? folderTabActiveClass : folderTabInactiveClass,
	);

const folderTabsRowClass = css({
	display: "inline-flex",
	width: "full",
	minWidth: "0",
	maxWidth: "full",
	flexWrap: "wrap",
	gap: "1",
	borderRadius: "shell-sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.panel",
	padding: "0.5",
});

const browserContainerClass = css({
	display: "flex",
	height: "52",
	minHeight: "48",
	width: "full",
	minWidth: "0",
	flexShrink: "0",
	flexDirection: "column",
});

const browserEmptyClass = css({
	display: "grid",
	minHeight: "0",
	flex: "1",
	placeItems: "center",
	borderRadius: "md",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.widget",
	paddingInline: "3",
	textAlign: "center",
	fontSize: "shell-text-sm",
	color: "text.muted",
});

const formColumnClass = css({
	display: "flex",
	minWidth: "0",
	flexDirection: "column",
	gap: "3",
});

const fieldColumnClass = css({
	display: "flex",
	flexDirection: "column",
	gap: "1",
});

const fieldLabelClass = css({
	fontSize: "xs",
	fontWeight: "medium",
	textTransform: "uppercase",
	letterSpacing: "wide",
	color: "text.muted",
});

const errorClass = css({
	display: "flex",
	alignItems: "center",
	gap: "2",
	borderRadius: "shell-sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "status.error",
	backgroundColor: "status.error/10",
	paddingInline: "3",
	paddingBlock: "2",
	fontSize: "xs",
	color: "status.error",
});

const previewBoxClass = css({
	height: "full",
	width: "full",
});

/**
 * `DialogShell` content styling for path-add dialogs. The shell enforces
 * the 3-area grid (Header=auto, Content=minmax(0,1fr), Footer=auto). This
 * class only adjusts padding / overflow so the editor body uses the full
 * panel width without the default shell gutter.
 */
const pathDialogContentClass = css({
	display: "flex",
	minHeight: 0,
	minWidth: 0,
	flexDirection: "column",
	overflow: "hidden",
	paddingInline: "0",
	backgroundColor: "surface.dialog",
});

/** Footer adds a divider and shell-aligned padding for the action row. */
const pathDialogFooterClass = css({
	borderTopWidth: "1px",
	borderTopStyle: "solid",
	borderTopColor: "border.default",
	paddingInline: "var(--ty-shell-pad-inline)",
	paddingBlock: "var(--ty-shell-space)",
});

function FolderTabs(props: {
	activeTab: PresetAddFolderType;
	onTabChange: (tab: PresetAddFolderType) => void;
}): JSX.Element {
	const { activeTab, onTabChange } = props;
	return (
		<div className={folderTabsRowClass}>
			{FOLDER_TABS.map((tab) => (
				<button
					key={tab.id}
					type="button"
					className={FOLDER_TAB_CLASS(activeTab === tab.id)}
					onClick={() => onTabChange(tab.id)}
				>
					{tab.label}
				</button>
			))}
		</div>
	);
}

function BrowserContent(props: {
	cepBrowser: boolean;
	emptyConfigured: boolean;
	activeTab: PresetAddFolderType;
	loadingFiles: boolean;
	browserError: string | null;
	browserEntries: DirectoryBrowserEntry[];
	canGoUp: boolean;
	selectedPath: string;
	onGoUp: () => void;
	onEntryClick: (entry: DirectoryBrowserEntry) => void;
	onEntryActivate: (entry: DirectoryBrowserEntry) => void;
	onToggleFileSelected: (path: string) => void;
}): JSX.Element {
	const {
		cepBrowser,
		emptyConfigured,
		activeTab,
		loadingFiles,
		browserError,
		browserEntries,
		canGoUp,
		selectedPath,
		onGoUp,
		onEntryClick,
		onEntryActivate,
		onToggleFileSelected,
	} = props;

	return (
		<div className={browserContainerClass}>
			{!cepBrowser ? (
				<div className={browserEmptyClass}>
					<span>File browser requires CEP Node</span>
				</div>
			) : emptyConfigured ? (
				<div className={browserEmptyClass}>
					<span>
						{activeTab === "presets"
							? "No presets folder configured"
							: activeTab === "scripts"
								? "No scripts folder configured"
								: "No plugins folder configured"}
					</span>
				</div>
			) : (
				<DirectoryBrowser
					selectionMode="files"
					entries={browserEntries}
					loading={loadingFiles}
					canGoUp={canGoUp}
					onGoUp={() => void onGoUp()}
					onEntryClick={onEntryClick}
					onEntryActivate={onEntryActivate}
					isSelected={(p) => p === selectedPath.trim()}
					onToggleSelected={onToggleFileSelected}
					selectedSummary={{
						files: selectedPath.trim() ? 1 : 0,
						folders: 0,
					}}
					showSelectedSummary={Boolean(selectedPath.trim())}
					viewMode="list"
					onViewModeChange={() => {}}
					scale={1}
					aspect="square"
					loadingLabel="Loading..."
					emptyLabel="No files found"
					upLabel="Go up"
				/>
			)}
		</div>
	);
}

/** Register a single catalog preset from a filesystem path (catalog authoring, not a separate "file preset" type). */
function PathDialogFooterActions({
	close,
	busy,
	canAdd,
	handleAdd,
}: {
	close: () => void;
	busy: boolean;
	canAdd: boolean;
	handleAdd: () => Promise<void>;
}): JSX.Element {
	return (
		<DialogFooterActions>
			<Button
				type="button"
				variant="ghost"
				uiSize="sm"
				fullWidth
				onClick={() => close()}
				disabled={busy}
			>
				Cancel
			</Button>
			<Button
				type="button"
				variant="primary"
				uiSize="sm"
				fullWidth
				start={<Save size={14} />}
				disabled={!canAdd}
				onClick={() => void handleAdd()}
			>
				{busy ? "Creating..." : "Create"}
			</Button>
		</DialogFooterActions>
	);
}

export function PathDialog(): JSX.Element {
	const { close } = useDialogClose();
	const [roots, setRoots] = useState({
		presetRoot: "",
		scriptRoot: "",
		pluginRoot: "",
	});
	const [pathsReady, setPathsReady] = useState(false);
	const [activeTab, setActiveTab] = useState<PresetAddFolderType>("presets");
	const [currentPaths, setCurrentPaths] = useState<
		Record<PresetAddFolderType, string>
	>({
		presets: "",
		scripts: "",
		plugins: "",
		other: "",
	});

	const [name, setName] = useState("");
	const [nameManuallyEdited, setNameManuallyEdited] = useState(false);
	const [selectedPath, setSelectedPath] = useState("");
	const [rows, setRows] = useState<ArchiveListRow[]>([]);
	const [loadingFiles, setLoadingFiles] = useState(false);
	const [browserError, setBrowserError] = useState<string | null>(null);

	const [iconDraft, setIconDraft] = useState(() => createArchiveIconDraft());
	const [description, setDescription] = useState("");
	const [descriptionImage, setDescriptionImage] = useState("");

	const [busy, setBusy] = useState(false);
	const dialogMessageRef = useRef<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			const raw = await readSettings(window);
			if (cancelled) {
				return;
			}
			const parsed = parseRootPathsFromSettingsJson(raw ?? undefined);
			setRoots(parsed);
			const other = readUserHomeOrFallback();
			setCurrentPaths({
				presets: parsed.presetRoot,
				scripts: parsed.scriptRoot,
				plugins: parsed.pluginRoot,
				other: other,
			});
			setPathsReady(true);
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	// Auto-fill the name from the selected path until the user manually
	// edits the name input. Every selectedPath change re-runs this so the
	// name follows whichever file is currently being authored.
	useEffect(() => {
		if (nameManuallyEdited) {
			return;
		}
		const fp = selectedPath.trim();
		if (!fp) {
			return;
		}
		setName(derivePresetNameFromFilePath(fp));
	}, [selectedPath, nameManuallyEdited]);

	const cepBrowser = canUseCepNodeFileBrowser(window);
	const currentPath = currentPaths[activeTab].trim();
	const rootPath = rootPathForTab(roots, activeTab);

	const isAtDriveRoot = useMemo(() => {
		if (activeTab !== "other") {
			return false;
		}
		const p = currentPaths.other.trim();
		if (!p || p === PRESET_ADD_DRIVES_PATH) {
			return false;
		}
		const n = normalizeFsPath(p);
		return /^[a-z]:[/\\]?$/.test(n) || n === "/";
	}, [activeTab, currentPaths.other]);

	const canGoUp = useMemo(() => {
		if (!currentPath) {
			return false;
		}
		if (currentPath === PRESET_ADD_DRIVES_PATH) {
			return false;
		}
		if (activeTab === "other") {
			return true;
		}
		if (!rootPath.trim()) {
			return false;
		}
		const nc = normalizeFsPath(currentPath);
		const nr = normalizeFsPath(rootPath);
		return nc !== nr && nc.length > nr.length;
	}, [activeTab, currentPath, rootPath]);

	useEffect(() => {
		if (!pathsReady || !cepBrowser) {
			setRows([]);
			setBrowserError(null);
			setLoadingFiles(false);
			return;
		}
		if (!currentPath) {
			setRows([]);
			setBrowserError(null);
			setLoadingFiles(false);
			return;
		}
		let cancelled = false;
		setLoadingFiles(true);
		setBrowserError(null);
		void loadArchiveRows(window, currentPath, activeTab).then(
			({ rows: nextRows, error }) => {
				if (cancelled) {
					return;
				}
				setRows(nextRows);
				setBrowserError(error);
				setLoadingFiles(false);
			},
		);
		return () => {
			cancelled = true;
		};
	}, [pathsReady, cepBrowser, activeTab, currentPath]);

	const [presetId] = useState(() => {
		const id = createLocalPresetCatalogId();
		assertOpaqueId(id);
		return id;
	});

	/** Non-persisted display label derived from name, not an ID. */
	const _previewLabel = useMemo(() => name.trim() || undefined, [name]);

	const resolvedIcon = useMemo(
		() => iconDraftToPresetIcon(iconDraft),
		[iconDraft],
	);

	const _previewPreset = useMemo((): Preset | null => {
		const fp = selectedPath.trim();
		if (!fp) {
			return null;
		}
		return createPresetFromFile({
			id: presetId,
			filePath: fp,
			title: name.trim() || undefined,
			description: description.trim() || undefined,
			descriptionImage: descriptionImage.trim() || undefined,
			...(resolvedIcon ? { icon: resolvedIcon } : {}),
		});
	}, [
		presetId,
		selectedPath,
		name,
		description,
		descriptionImage,
		resolvedIcon,
	]);

	const browseHint =
		selectedPath.trim() || currentPath || readUserHomeOrFallback();

	const pathFieldDisplay = selectedPath.trim() || currentPath;

	const handleGoUp = useCallback(async () => {
		if (activeTab === "other" && isAtDriveRoot) {
			setCurrentPaths((prev) => ({ ...prev, other: PRESET_ADD_DRIVES_PATH }));
			return;
		}
		const service = createCepNodeFileBrowserService({ win: window });
		const parent = service.getParentDirectory(currentPath);
		if (parent && parent !== currentPath) {
			setCurrentPaths((prev) => ({ ...prev, [activeTab]: parent }));
		}
	}, [activeTab, isAtDriveRoot, currentPath]);

	const navigateToDir = useCallback(
		(dirPath: string) => {
			setCurrentPaths((prev) => ({ ...prev, [activeTab]: dirPath }));
		},
		[activeTab],
	);

	const browserEntries = useMemo((): DirectoryBrowserEntry[] => {
		return rows.map((r) => ({
			path: r.path,
			name: r.name,
			isDirectory: r.kind === "directory",
		}));
	}, [rows]);

	const handleBrowserEntryClick = useCallback(
		(entry: DirectoryBrowserEntry) => {
			if (entry.isDirectory) {
				navigateToDir(entry.path);
				return;
			}
			setSelectedPath(entry.path);
		},
		[navigateToDir],
	);

	const handleBrowserEntryActivate = useCallback(
		(entry: DirectoryBrowserEntry) => {
			if (entry.isDirectory) {
				navigateToDir(entry.path);
				return;
			}
			setSelectedPath(entry.path);
		},
		[navigateToDir],
	);

	const handleToggleFileSelected = useCallback((entryPath: string) => {
		setSelectedPath((prev) => (prev === entryPath ? "" : entryPath));
	}, []);

	const canAdd = Boolean(selectedPath.trim() && name.trim() && !busy);

	const handleFileDrop = useCallback((files: DroppedFile[]) => {
		if (files.length === 0) return;
		const first = files[0];
		if (first.isDirectory || files.length > 1) return;
		setSelectedPath(first.path);
	}, []);

	const handleAdd = useCallback(async () => {
		if (!canAdd) {
			return;
		}
		const fp = selectedPath.trim();
		setBusy(true);
		dialogMessageRef.current = null;

		let icon: ReturnType<typeof iconDraftToPresetIcon>;
		try {
			icon = iconDraftToPresetIcon(iconDraft);
		} catch (e) {
			dialogMessageRef.current = e instanceof Error ? e.message : String(e);
			setBusy(false);
			return;
		}
		const record = createPresetFromFile({
			id: presetId,
			filePath: fp,
			title: name.trim() || undefined,
			description: description.trim() || undefined,
			descriptionImage: descriptionImage.trim() || undefined,
			...(icon ? { icon } : {}),
		});
		if (!record) {
			dialogMessageRef.current = "Could not build preset record";
			setBusy(false);
			return;
		}
		tracePresetLifecycle({
			kind: "preset.save.requested",
			presetId,
			type: record.type,
			userFacingName: record.title,
			saveDir: "",
			fullPath: fp,
			entryPoint: "path-dialog",
		});
		try {
			// Issue #130 (Layer 3): the catalog-add PathDialog used to
			// persist the `Preset` record straight from the user-typed
			// path with no asset verification — turning it into a
			// ghost-record factory for any non-existent path the user
			// picked. Re-verify the asset on disk before upserting so
			// `Script file not found` on execute never traces back to
			// this surface. Throws `PresetAssetMissingError` (or an
			// unverifiable transport) and we surface the message via
			// `dialogMessageRef`, matching the existing error UX.
			await verifyAndUpsertPreset({
				win: window,
				presetId,
				record,
				filePath: fp,
				entryPoint: "path-dialog",
			});
			tracePresetLifecycle({
				kind: "preset.save.persist",
				presetId,
				type: record.type,
				filePath: fp,
				entryPoint: "path-dialog",
			});
			dialogMessageRef.current = `Saved: ${record.id}`;
			await notifyPanelsAfterPresetSave(window, {
				sourceSurfaceId: "dialog-preset-add",
				catalogRefIds: [record.id],
			});
			close();
		} catch (e) {
			const errMsg = e instanceof Error ? e.message : String(e);
			dialogMessageRef.current = errMsg;
			tracePresetLifecycle({
				kind: "preset.save.failed",
				presetId,
				stage: "verify",
				message: errMsg,
				entryPoint: "path-dialog",
			});
		} finally {
			// One reset for both outcomes. Clearing the flag on the success
			// path only is how a failed save leaves the dialog permanently
			// disabled with no way back short of closing it.
			setBusy(false);
		}
	}, [
		selectedPath,
		canAdd,
		name,
		description,
		descriptionImage,
		iconDraft,
		presetId,
		close,
	]);

	const emptyConfigured =
		activeTab !== "other" && !rootPath.trim() && pathsReady;

	const _footerMessage = dialogMessageRef.current;

	return (
		<DialogShell
			title="Add catalog preset from path"
			surfaceId="dialog-preset-add"
			modifier="wsd-root--preset-tool"
			contentClassName={pathDialogContentClass}
			footerClassName={pathDialogFooterClass}
			onFileDrop={handleFileDrop}
			footer={
				<PathDialogFooterActions
					close={close}
					busy={busy}
					canAdd={canAdd}
					handleAdd={handleAdd}
				/>
			}
		>
			<DialogBody>
				<div className={formColumnClass}>
					<Input
						label="Name"
						value={name}
						onChange={(e) => {
							setName(e.target.value);
							setNameManuallyEdited(true);
						}}
						placeholder="Enter name..."
						autoComplete="off"
						spellCheck={false}
						uiSize="md"
					/>

					<div className={fieldColumnClass}>
						<span className={fieldLabelClass}>File Path</span>
						<PathField
							value={pathFieldDisplay}
							onChange={setSelectedPath}
							onBrowse={() =>
								selectFile(browseHint, "Select File", (picked) =>
									setSelectedPath(picked),
								)
							}
							browseAriaLabel="Browse file"
							browseSlot={<Icon icon={FileSearch} size={16} aria-hidden />}
							placeholder={
								currentPath.trim()
									? "Current folder shown — pick a file or browse"
									: "Select a file..."
							}
							uiSize="md"
						/>
					</div>

					<FolderTabs activeTab={activeTab} onTabChange={setActiveTab} />

					{browserError ? (
						<div className={errorClass}>
							<span>{browserError}</span>
						</div>
					) : null}

					<BrowserContent
						cepBrowser={cepBrowser}
						emptyConfigured={emptyConfigured}
						activeTab={activeTab}
						loadingFiles={loadingFiles}
						browserError={browserError}
						browserEntries={browserEntries}
						canGoUp={canGoUp}
						selectedPath={selectedPath}
						onGoUp={handleGoUp}
						onEntryClick={handleBrowserEntryClick}
						onEntryActivate={handleBrowserEntryActivate}
						onToggleFileSelected={handleToggleFileSelected}
					/>

					{/* Details (description + image) */}
					<ArchiveDetailsSection
						description={description}
						onDescriptionChange={setDescription}
						descriptionImage={descriptionImage}
						onDescriptionImageChange={setDescriptionImage}
						browseDir={browseHint}
					/>

					{/* Icon */}
					<PresetIconEditor
						draft={iconDraft}
						onChange={setIconDraft}
						browseDir={browseHint}
						label="Icon"
						preview={
							<FramedPresetGlyph
								preset={
									{
										id: "icon-preview",
										type: "preset",
										title: "Preview",
										filePath: "ty-plus://icon-preview",
										icon: iconDraftToPresetIcon(iconDraft) ?? {
											type: "text",
											param: { text: "?" },
										},
									} satisfies Preset
								}
								boxClass={previewBoxClass}
							/>
						}
					/>
				</div>
			</DialogBody>
		</DialogShell>
	);
}

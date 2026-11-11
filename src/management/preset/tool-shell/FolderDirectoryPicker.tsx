import { type JSX, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { readUserHomeOrFallback } from "@/management/preset/catalog-add/browse-start-dir";
import { parseRootPathsFromSettingsJson } from "@/management/preset/catalog-add/parse-root-paths";
import {
	canUseCepNodeFileBrowser,
	createCepNodeFileBrowserService,
} from "@/management/storage/file-browser-service";
import {
	DirectoryBrowser,
	type DirectoryBrowserEntry,
	type DirectoryBrowserShellSelectionMode,
} from "@/management/storage/ui/DirectoryBrowser";
import { readSettings } from "@/management/workspace/persistence/store";
import { css, cx } from "@/styled-system/css";

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

const folderTabClass = (active: boolean): string =>
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

const columnClass = css({
	display: "flex",
	minWidth: "0",
	flexDirection: "column",
	gap: "1",
});

const labelClass = css({
	fontSize: "xs",
	fontWeight: "medium",
	textTransform: "uppercase",
	letterSpacing: "wide",
	color: "text.muted",
});

const errorClass = css({
	borderRadius: "shell-sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.widget",
	paddingInline: "2",
	paddingBlock: "1",
	fontSize: "xs",
	color: "text.muted",
});

const browserContainerClass = css({
	display: "flex",
	height: "64",
	minHeight: "48",
	width: "full",
	minWidth: "0",
	flexDirection: "column",
});

const browserInnerClass = css({
	flex: "1",
	minHeight: "0",
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

export function FolderDirectoryPicker({
	value,
	onChange,
	label = "Folder browser",
	selectionMode = "folders",
	selectedPaths,
	onToggleSelected,
	candidatePresets,
	candidateDirs,
	onPickPreset,
}: {
	value: string;
	onChange: (next: string) => void;
	label?: string;
	selectionMode?: DirectoryBrowserShellSelectionMode;
	selectedPaths?: string[];
	onToggleSelected?: (path: string, selected: boolean) => void;
	candidatePresets?: { id: string; title: string; filePath: string }[];
	candidateDirs?: string[];
	onPickPreset?: (presetId: string) => void;
}): JSX.Element {
	const { t } = useTranslation("widgets");
	const [currentPath, setCurrentPath] = useState(
		() => value.trim() || readUserHomeOrFallback(),
	);
	const [entries, setEntries] = useState<DirectoryBrowserEntry[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const cepBrowser = canUseCepNodeFileBrowser(window);

	// Root paths segment (like PathDialog) — presets/scripts/plugins/other
	const rootsRef = useRef({
		presetRoot: "",
		scriptRoot: "",
		pluginRoot: "",
	});
	const [_pathsReady, setPathsReady] = useState(false);
	const [activeRoot, setActiveRoot] = useState<
		"presets" | "scripts" | "plugins" | "other"
	>("presets");

	// load roots on mount only
	const initialValueRef = useRef(value);
	useEffect(() => {
		let cancelled = false;
		const valueTrimmed = initialValueRef.current.trim();
		void (async () => {
			try {
				const raw = await readSettings(window);
				if (cancelled) return;
				let rawArg: string | undefined;
				if (raw != null) rawArg = raw;
				const parsed = parseRootPathsFromSettingsJson(rawArg);
				rootsRef.current = parsed;
				const presetRootVal = parsed.presetRoot;
				let presetRootTrimmed: string | false = "";
				if (presetRootVal) presetRootTrimmed = presetRootVal.trim();
				if (valueTrimmed === "") {
					if (presetRootTrimmed) {
						setActiveRoot("presets");
						setCurrentPath(parsed.presetRoot);
					}
				}
				setPathsReady(true);
			} catch {
				if (!cancelled) setPathsReady(true);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	// list directory whenever currentPath or cepBrowser changes
	useEffect(() => {
		let cancelled = false;
		if (!cepBrowser || !currentPath.trim()) {
			setEntries([]);
			return;
		}
		setLoading(true);
		setError("");
		const service = createCepNodeFileBrowserService({ win: window });
		void service.listDirectory(currentPath).then(
			(rows) => {
				if (cancelled) return;
				setEntries(
					rows.map((row) => ({
						path: row.path,
						name: row.name,
						isDirectory: row.isDirectory,
						fileType: row.fileType,
						extension: row.extension,
						previewUrl: row.previewUrl,
					})),
				);
				setLoading(false);
			},
			(e) => {
				if (cancelled) return;
				setEntries([]);
				setError(e instanceof Error ? e.message : String(e));
				setLoading(false);
			},
		);
		return () => {
			cancelled = true;
		};
	}, [cepBrowser, currentPath]);

	const canGoUp = Boolean(currentPath.trim());

	// Selected paths: prefer selectedPaths prop, else fallback to single value
	const selectedPathsLocal = (
		selectedPaths ?? (value.trim() ? [value.trim()] : [])
	).flatMap((p) => {
		const trimmed = p.trim();
		return trimmed ? [trimmed] : [];
	});
	const toggleSelected = (entryPath: string) => {
		const isSelected = selectedPathsLocal.includes(entryPath);
		if (onToggleSelected) return onToggleSelected(entryPath, !isSelected);
		return onChange(entryPath);
	};
	const selectedSummary = {
		files: selectionMode !== "folders" ? selectedPathsLocal.length : 0,
		folders: selectionMode !== "files" ? selectedPathsLocal.length : 0,
	};

	return (
		<div className={columnClass}>
			<span className={labelClass}>{label}</span>
			{error ? <div className={errorClass}>{error}</div> : null}

			{/* Root segment (Presets/Scripts/Plug-ins/Other) */}
			<div className={folderTabsRowClass}>
				<button
					type="button"
					className={folderTabClass(activeRoot === "presets")}
					onClick={() => {
						setActiveRoot("presets");
						if (rootsRef.current.presetRoot.trim())
							setCurrentPath(rootsRef.current.presetRoot);
					}}
				>
					{t("folderDirectoryPicker.tab.presets")}
				</button>
				<button
					type="button"
					className={folderTabClass(activeRoot === "scripts")}
					onClick={() => {
						setActiveRoot("scripts");
						if (rootsRef.current.scriptRoot.trim())
							setCurrentPath(rootsRef.current.scriptRoot);
					}}
				>
					{t("folderDirectoryPicker.tab.scripts")}
				</button>
				<button
					type="button"
					className={folderTabClass(activeRoot === "plugins")}
					onClick={() => {
						setActiveRoot("plugins");
						if (rootsRef.current.pluginRoot.trim())
							setCurrentPath(rootsRef.current.pluginRoot);
					}}
				>
					{t("folderDirectoryPicker.tab.plugins")}
				</button>
				<button
					type="button"
					className={folderTabClass(activeRoot === "other")}
					onClick={() => {
						setActiveRoot("other");
						setCurrentPath(readUserHomeOrFallback());
					}}
				>
					{t("folderDirectoryPicker.tab.other")}
				</button>
			</div>

			<div className={browserContainerClass}>
				{cepBrowser ? (
					<>
						<div className={browserInnerClass}>
							<DirectoryBrowser
								selectionMode={selectionMode}
								entries={entries}
								loading={loading}
								canGoUp={canGoUp}
								onGoUp={() => {
									const service = createCepNodeFileBrowserService({
										win: window,
									});
									const parent = service.getParentDirectory(currentPath);
									if (parent && parent !== currentPath) setCurrentPath(parent);
								}}
								onEntryClick={(entry) => {
									if (entry.isDirectory) {
										setCurrentPath(entry.path);
									}
								}}
								onEntryActivate={(entry) => {
									if (entry.isDirectory) setCurrentPath(entry.path);
								}}
								isSelected={(entryPath) =>
									selectedPathsLocal.includes(entryPath)
								}
								onToggleSelected={(entryPath) => toggleSelected(entryPath)}
								selectedSummary={selectedSummary}
								viewMode="list"
								onViewModeChange={() => {}}
								scale={1}
								aspect="square"
								loadingLabel={t("folderDirectoryPicker.loading")}
								emptyLabel={
									selectionMode === "folders"
										? t("folderDirectoryPicker.emptyFolders")
										: t("folderDirectoryPicker.emptyItems")
								}
								upLabel={t("folderDirectoryPicker.goUp")}
							/>
						</div>

						{/* candidatePresets kept for rule auto-pick behavior; do not render a detected list here */}
					</>
				) : (
					<div className={browserEmptyClass}>
						<span>{t("folderDirectoryPicker.cepNodeRequired")}</span>
					</div>
				)}
			</div>
		</div>
	);
}

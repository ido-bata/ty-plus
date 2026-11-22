import type { JSX } from "react";
import { i18n } from "@/management/i18n/index";
import type { FileEntry } from "@/management/storage/ui/file-entry/FileEntryList";
import { FileEntryList } from "@/management/storage/ui/file-entry/FileEntryList";
import { css } from "@/styled-system/css";
import { PreviewGroup } from "./ComponentPreviewSection";

const MOCK_DIR_ENTRIES: FileEntry[] = [
	{
		path: "/host/presets/animation",
		name: "animation",
		isDirectory: true,
	},
	{
		path: "/host/presets/transitions",
		name: "transitions",
		isDirectory: true,
	},
	{
		path: "/host/presets/fade-in.ffx",
		name: "fade-in.ffx",
		isDirectory: false,
		extension: ".ffx",
	},
	{
		path: "/host/presets/slide-left.ffx",
		name: "slide-left.ffx",
		isDirectory: false,
		extension: ".ffx",
	},
	{
		path: "/host/presets/scale-up.ffx",
		name: "scale-up.ffx",
		isDirectory: false,
		extension: ".ffx",
	},
];

const browserContainerStyle = css({
	height: "48",
	minHeight: 0,
});

export function DirectoryBrowserPreview({
	dirSelectedFiles,
	setDirSelectedFiles,
	dirSelectedFolders,
	setDirSelectedFolders,
	viewMode,
}: {
	dirSelectedFiles: Set<string>;
	setDirSelectedFiles: (fn: (prev: Set<string>) => Set<string>) => void;
	dirSelectedFolders: Set<string>;
	setDirSelectedFolders: (fn: (prev: Set<string>) => Set<string>) => void;
	viewMode: "list" | "icons";
}): JSX.Element {
	return (
		<PreviewGroup
			title={i18n.t(
				viewMode === "icons"
					? "settings:componentPreview.iconCardView"
					: "settings:componentPreview.directoryBrowser",
			)}
		>
			<div className={browserContainerStyle}>
				<FileEntryList
					entries={MOCK_DIR_ENTRIES}
					loading={false}
					canGoUp={true}
					onEntryClick={() => {}}
					onEntryActivate={() => {}}
					selectionMode="both"
					isSelected={(path, kind) =>
						kind === "file"
							? dirSelectedFiles.has(path)
							: dirSelectedFolders.has(path)
					}
					onToggleSelected={(path, kind) => {
						const toggle =
							kind === "file" ? setDirSelectedFiles : setDirSelectedFolders;
						toggle((prev) => {
							const next = new Set(prev);
							if (next.has(path)) next.delete(path);
							else next.add(path);
							return next;
						});
					}}
					selectedSummary={{
						files: dirSelectedFiles.size,
						folders: dirSelectedFolders.size,
					}}
					showSelectedSummary={true}
					viewMode={viewMode}
					aspect="square"
					emptyLabel={i18n.t("settings:componentPreview.noFilesFound")}
					loadingLabel={i18n.t("common:app.loading")}
					upLabel=".."
				/>
			</div>
		</PreviewGroup>
	);
}

import type { JSX, ReactNode, RefObject } from "react";
import type { PresetType } from "@/management/preset/contract";
import type { FileBrowserFileType } from "@/management/storage/file-browser-service";
import { css } from "@/styled-system/css";
import {
	type BrowseModeOption,
	BrowserBrowseModeSelect,
} from "./BrowserBrowseModeSelect";
import { BrowserFilterPanel } from "./BrowserFilterPanel";
import { BrowserPathField } from "./BrowserPathField";
import { BrowserSearchField } from "./BrowserSearchField";
import { BrowserToolbar } from "./BrowserToolbar";
import type { FileBrowserBrowseMode, FileBrowserFilter } from "./lib/types";
export type BrowserHeaderProps = {
	searchInputRef: RefObject<HTMLInputElement | null>;
	searchDraft: string;
	onSearchDraftChange: (next: string) => void;
	onClearSearch: () => void;
	searchInlineTrailing: ReactNode;
	searchPlaceholder: string;
	onPathDraftChange: (next: string) => void;
	onCommitPath: () => void;
	onBrowseFolders?: () => void;
	pathPickerPrompt: string;
	pathPickerAriaLabel: string;
	pathInputPlaceholder: string;
	pathInputTitle: string;
	browseMode: FileBrowserBrowseMode;
	browseModeOptions: readonly BrowseModeOption[];
	onBrowseModeChange: (next: FileBrowserBrowseMode) => void;
	browseModeSelectAriaLabel: string;
	viewMode: "list" | "icons";
	onViewModeChange: (next: "list" | "icons") => void;
	goUpAvailable: boolean;
	filtersExpanded: boolean;
	onRefresh: () => void;
	onGoUp: () => void;
	onBrowseDrives: () => void;
	onToggleFilters: () => void;
	detailedFiltersLabel: string;
	listViewAriaLabel: string;
	iconViewAriaLabel: string;
	viewModeLegend: string;
	coarseFilter: FileBrowserFilter;
	onCoarseFilterChange: (next: FileBrowserFilter) => void;
	hiddenExtensions: readonly string[];
	onToggleHiddenExtension: (ext: string) => void;
	hiddenFileTypes: readonly FileBrowserFileType[];
	onToggleHiddenFileType: (ft: FileBrowserFileType) => void;
	catalogHiddenPresetTypes: readonly PresetType[];
	onToggleCatalogHiddenPresetType: (pt: PresetType) => void;
	recursiveSearch: boolean;
	onToggleRecursiveSearch: () => void;
	pathDisplay: string;
	typeListLabel: string;
	quickFilterAriaLabel: string;
	optionAllLabel: string;
	optionMediaLabel: string;
	optionPresetsLabel: string;
	optionScriptsLabel: string;
	optionFontsLabel: string;
	extensionHideLabel: string;
	fileTypeHideLabel: string;
	catalogPresetTypesHideLabel: string;
	anchorsNoFiltersLabel: string;
	recursiveSearchLabel: (state: string) => string;
	recursiveOnLabel: string;
	recursiveOffLabel: string;
};
export function BrowserHeader(props: BrowserHeaderProps): JSX.Element {
	const {
		searchInputRef,
		searchDraft,
		onSearchDraftChange,
		onClearSearch,
		searchInlineTrailing,
		searchPlaceholder,
		onPathDraftChange,
		onCommitPath,
		onBrowseFolders,
		pathPickerAriaLabel,
		pathInputPlaceholder,
		pathInputTitle,
		browseMode,
		browseModeOptions,
		onBrowseModeChange,
		browseModeSelectAriaLabel,
		viewMode,
		onViewModeChange,
		goUpAvailable,
		filtersExpanded,
		onRefresh,
		onGoUp,
		onBrowseDrives,
		onToggleFilters,
		detailedFiltersLabel,
		listViewAriaLabel,
		iconViewAriaLabel,
		viewModeLegend,
		coarseFilter,
		onCoarseFilterChange,
		hiddenExtensions,
		onToggleHiddenExtension,
		hiddenFileTypes,
		onToggleHiddenFileType,
		catalogHiddenPresetTypes,
		onToggleCatalogHiddenPresetType,
		recursiveSearch,
		onToggleRecursiveSearch,
		pathDisplay,
		typeListLabel,
		quickFilterAriaLabel,
		optionAllLabel,
		optionMediaLabel,
		optionPresetsLabel,
		optionScriptsLabel,
		optionFontsLabel,
		extensionHideLabel,
		fileTypeHideLabel,
		catalogPresetTypesHideLabel,
		anchorsNoFiltersLabel,
		recursiveSearchLabel,
		recursiveOnLabel,
		recursiveOffLabel,
	} = props;
	return (
		<div
			className={css({
				display: "flex",
				minWidth: 0,
				flexDirection: "column",
				gap: "2.5",
			})}
		>
			{" "}
			<div
				className={css({
					display: "flex",
					minWidth: 0,
					alignItems: "stretch",
					gap: "2",
				})}
			>
				{" "}
				<div
					className={css({
						display: "flex",
						minHeight: 0,
						minWidth: 0,
						flex: 1,
						flexDirection: "column",
						gap: "2.5",
					})}
				>
					{" "}
					<BrowserSearchField
						inputRef={searchInputRef}
						value={searchDraft}
						onChange={onSearchDraftChange}
						onClear={onClearSearch}
						placeholder={searchPlaceholder}
						inlineTrailing={searchInlineTrailing}
					/>{" "}
					<BrowserPathField
						value={pathDisplay}
						onChange={onPathDraftChange}
						onCommit={onCommitPath}
						onBrowse={onBrowseFolders}
						browseAriaLabel={pathPickerAriaLabel}
						placeholder={pathInputPlaceholder}
						inputTitle={pathInputTitle}
					/>{" "}
				</div>{" "}
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
					{" "}
					<BrowserToolbar
						goUpAvailable={goUpAvailable}
						filtersExpanded={filtersExpanded}
						onRefresh={onRefresh}
						onGoUp={onGoUp}
						onBrowseDrives={onBrowseDrives}
						onToggleFilters={onToggleFilters}
						viewMode={viewMode}
						onViewModeChange={onViewModeChange}
						detailedFiltersLabel={detailedFiltersLabel}
						listViewAriaLabel={listViewAriaLabel}
						iconViewAriaLabel={iconViewAriaLabel}
						viewModeLegend={viewModeLegend}
					/>{" "}
					<BrowserBrowseModeSelect
						value={browseMode}
						options={browseModeOptions}
						onChange={onBrowseModeChange}
						ariaLabel={browseModeSelectAriaLabel}
					/>{" "}
				</div>{" "}
			</div>{" "}
			{filtersExpanded ? (
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
					{" "}
					<BrowserFilterPanel
						browseMode={browseMode}
						coarseFilter={coarseFilter}
						onCoarseFilterChange={onCoarseFilterChange}
						hiddenExtensions={hiddenExtensions}
						onToggleHiddenExtension={onToggleHiddenExtension}
						hiddenFileTypes={hiddenFileTypes}
						onToggleHiddenFileType={onToggleHiddenFileType}
						catalogHiddenPresetTypes={catalogHiddenPresetTypes}
						onToggleCatalogHiddenPresetType={onToggleCatalogHiddenPresetType}
						recursiveSearch={recursiveSearch}
						onToggleRecursiveSearch={onToggleRecursiveSearch}
						typeListLabel={typeListLabel}
						quickFilterAriaLabel={quickFilterAriaLabel}
						optionAllLabel={optionAllLabel}
						optionMediaLabel={optionMediaLabel}
						optionPresetsLabel={optionPresetsLabel}
						optionScriptsLabel={optionScriptsLabel}
						optionFontsLabel={optionFontsLabel}
						extensionHideLabel={extensionHideLabel}
						fileTypeHideLabel={fileTypeHideLabel}
						catalogPresetTypesHideLabel={catalogPresetTypesHideLabel}
						anchorsNoFiltersLabel={anchorsNoFiltersLabel}
						recursiveSearchLabel={recursiveSearchLabel}
						recursiveOnLabel={recursiveOnLabel}
						recursiveOffLabel={recursiveOffLabel}
					/>{" "}
				</div>
			) : null}{" "}
		</div>
	);
}

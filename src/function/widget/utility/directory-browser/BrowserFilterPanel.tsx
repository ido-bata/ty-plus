import type { JSX } from "react";
import type { PresetType } from "@/management/preset/contract";
import type { FileBrowserFileType } from "@/management/storage/file-browser-service";
import { css } from "@/styled-system/css";
import { FilterToggleButton } from "./FilterToggleButton";
import type { FileBrowserBrowseMode, FileBrowserFilter } from "./lib/types";

const EXT_TOGGLE_SET = [".ffx", ".jsx", ".jsxbin", ".mogrt", ".json"] as const;

const FILE_TYPE_TOGGLE: readonly FileBrowserFileType[] = [
	"ae-preset",
	"script",
	"image",
	"video",
	"audio",
	"json",
	"text",
	"unknown",
] as const;

const CATALOG_TYPE_TOGGLE_SET: readonly PresetType[] = [
	"preset",
	"script",
	"plugin",
	"footage",
] as const;

export type BrowserFilterPanelProps = {
	browseMode: FileBrowserBrowseMode;
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

export function BrowserFilterPanel(
	props: BrowserFilterPanelProps,
): JSX.Element {
	const {
		browseMode,
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

	if (browseMode === "anchors") {
		return (
			<p className={css({ fontSize: "text-2xs", color: "text.muted" })}>
				{anchorsNoFiltersLabel}
			</p>
		);
	}

	if (browseMode === "presetsCatalog") {
		return (
			<div className={css({ display: "flex", flexWrap: "wrap", gap: "1" })}>
				<span
					className={css({
						width: "full",
						fontSize: "text-2xs",
						color: "text.muted",
					})}
				>
					{catalogPresetTypesHideLabel}
				</span>
				{CATALOG_TYPE_TOGGLE_SET.map((ct) => (
					<FilterToggleButton
						key={ct}
						pressed={catalogHiddenPresetTypes.includes(ct)}
						label={ct}
						onClick={() => onToggleCatalogHiddenPresetType(ct)}
					/>
				))}
			</div>
		);
	}

	return (
		<>
			<div className={css({ display: "flex", flexWrap: "wrap", gap: "1" })}>
				<span
					className={css({
						width: "full",
						fontSize: "text-2xs",
						color: "text.muted",
					})}
				>
					{typeListLabel}
				</span>
				<select
					className={css({
						maxWidth: "full",
						flexShrink: 1,
						borderRadius: "shell-sm",
						borderWidth: "1px",
						borderStyle: "solid",
						borderColor: "border.default",
						backgroundColor: "surface.widget",
						paddingBlock: "0.5",
						paddingRight: "6",
						paddingLeft: "1",
						fontSize: "text-2xs",
						color: "text.primary",
					})}
					value={coarseFilter}
					onChange={(e) =>
						onCoarseFilterChange(e.target.value as FileBrowserFilter)
					}
					aria-label={quickFilterAriaLabel}
				>
					<option value="all">{optionAllLabel}</option>
					<option value="media">{optionMediaLabel}</option>
					<option value="presets">{optionPresetsLabel}</option>
					<option value="scripts">{optionScriptsLabel}</option>
					<option value="fonts">{optionFontsLabel}</option>
				</select>
			</div>
			<div className={css({ display: "flex", flexWrap: "wrap", gap: "1" })}>
				<span
					className={css({
						width: "full",
						fontSize: "text-2xs",
						color: "text.muted",
					})}
				>
					{extensionHideLabel}
				</span>
				{EXT_TOGGLE_SET.map((ext) => (
					<FilterToggleButton
						key={ext}
						pressed={hiddenExtensions.includes(ext)}
						label={ext}
						onClick={() => onToggleHiddenExtension(ext)}
					/>
				))}
			</div>
			<div className={css({ display: "flex", flexWrap: "wrap", gap: "1" })}>
				<span
					className={css({
						width: "full",
						fontSize: "text-2xs",
						color: "text.muted",
					})}
				>
					{fileTypeHideLabel}
				</span>
				{FILE_TYPE_TOGGLE.map((ft) => (
					<FilterToggleButton
						key={ft}
						pressed={hiddenFileTypes.includes(ft)}
						label={ft}
						onClick={() => onToggleHiddenFileType(ft)}
					/>
				))}
			</div>
			<button
				type="button"
				className={css({
					width: "full",
					borderRadius: "shell-sm",
					borderWidth: "1px",
					borderStyle: "solid",
					borderColor: "border.default",
					backgroundColor: "surface.widget",
					opacity: 0.3,
					paddingInline: "2",
					paddingBlock: "1.5",
					textAlign: "left",
					fontSize: "text-2xs",
					color: "text.muted",
					_hover: {
						backgroundColor: "interactive.hover",
						color: "text.primary",
					},
				})}
				onClick={onToggleRecursiveSearch}
			>
				{recursiveSearchLabel(
					recursiveSearch ? recursiveOnLabel : recursiveOffLabel,
				)}
			</button>
		</>
	);
}

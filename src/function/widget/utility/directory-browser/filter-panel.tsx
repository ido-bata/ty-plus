import { Button, ListSelect } from "@ty-plus/ui";
import type { JSX } from "react";
import type { PresetType } from "@/management/preset/contract";
import type { FileBrowserFileType } from "@/management/storage/file-browser-service";
import { css } from "@/styled-system/css";
import type { FileBrowserBrowseMode, FileBrowserFilter } from "./types";

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

/**
 * A filter chip.  "Pressed" means the entry kind is currently *hidden* by
 * the filter, so the state is published through `aria-pressed` and carried
 * by the shared button variants rather than by an opacity override.
 */
function FilterChip({
	pressed,
	label,
	onClick,
}: {
	pressed: boolean;
	label: string;
	onClick: () => void;
}): JSX.Element {
	return (
		<Button
			type="button"
			variant={pressed ? "ghost" : "outline"}
			uiSize="sm"
			aria-pressed={pressed}
			onClick={onClick}
		>
			{label}
		</Button>
	);
}

export function renderFilterPanel(props: BrowserFilterPanelProps): JSX.Element {
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
					<FilterChip
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
				<ListSelect
					className={css({
						flexShrink: 0,
						maxWidth: "full",
					})}
					uiSize="sm"
					value={coarseFilter}
					options={[
						{ value: "all", label: optionAllLabel },
						{ value: "media", label: optionMediaLabel },
						{ value: "presets", label: optionPresetsLabel },
						{ value: "scripts", label: optionScriptsLabel },
						{ value: "fonts", label: optionFontsLabel },
					]}
					onChange={(next: string) =>
						onCoarseFilterChange(next as FileBrowserFilter)
					}
					aria-label={quickFilterAriaLabel}
				/>
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
					<FilterChip
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
					<FilterChip
						key={ft}
						pressed={hiddenFileTypes.includes(ft)}
						label={ft}
						onClick={() => onToggleHiddenFileType(ft)}
					/>
				))}
			</div>
			<Button
				type="button"
				variant="outline"
				uiSize="sm"
				fullWidth
				aria-pressed={recursiveSearch}
				onClick={onToggleRecursiveSearch}
				className={css({
					justifyContent: "flex-start",
					textAlign: "left",
				})}
			>
				{recursiveSearchLabel(
					recursiveSearch ? recursiveOnLabel : recursiveOffLabel,
				)}
			</Button>
		</>
	);
}

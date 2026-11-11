import type { Meta, StoryObj } from "@storybook/react";
import { useRef } from "react";
import { css } from "@/styled-system/css";
import type { BrowseModeOption } from "./BrowserBrowseModeSelect";
import { BrowserHeader } from "./BrowserHeader";
import type { FileBrowserBrowseMode } from "./lib/types";

const BROWSE_MODE_OPTIONS: readonly BrowseModeOption[] = [
	{ value: "filesystem", label: "Filesystem" },
	{ value: "anchors", label: "Anchors" },
	{ value: "presetsCatalog", label: "Catalog" },
];

const noop = (): void => undefined;

type Args = {
	searchDraft: string;
	pathDisplay: string;
	viewMode: "list" | "icons";
	browseMode: FileBrowserBrowseMode;
	filtersExpanded: boolean;
	goUpAvailable: boolean;
	recursiveSearch: boolean;
};

const baseArgs: Args = {
	searchDraft: "",
	pathDisplay: "/preset/root/presets",
	viewMode: "list",
	browseMode: "filesystem",
	filtersExpanded: false,
	goUpAvailable: true,
	recursiveSearch: false,
};

const meta = {
	title: "DirectoryBrowser/BrowserHeader",
	args: baseArgs,
	argTypes: {
		viewMode: {
			control: { type: "inline-radio" },
			options: ["list", "icons"],
		},
		browseMode: {
			control: { type: "inline-radio" },
			options: ["filesystem", "anchors", "presetsCatalog"],
		},
	},
	render: (args: Args) => {
		// `searchInputRef` is owned by `BrowserHeader` upstream; the story
		// passes a fresh ref each render because no upstream caller ever
		// re-mounts the header with a new ref identity.
		const ref = useRef<HTMLInputElement | null>(null);
		const props = {
			searchInputRef: ref,
			searchDraft: args.searchDraft,
			onSearchDraftChange: noop,
			onClearSearch: noop,
			searchInlineTrailing: null,
			searchPlaceholder: "Search presets",
			onPathDraftChange: noop,
			onCommitPath: noop,
			onBrowseFolders: noop,
			pathPickerPrompt: "Browse",
			pathPickerAriaLabel: "Browse folders",
			pathInputPlaceholder: "Enter path",
			pathInputTitle: "Path",
			browseMode: args.browseMode,
			browseModeOptions: BROWSE_MODE_OPTIONS,
			onBrowseModeChange: noop,
			browseModeSelectAriaLabel: "Browse mode",
			viewMode: args.viewMode,
			onViewModeChange: noop,
			goUpAvailable: args.goUpAvailable,
			filtersExpanded: args.filtersExpanded,
			onRefresh: noop,
			onGoUp: noop,
			onBrowseDrives: noop,
			onToggleFilters: noop,
			detailedFiltersLabel: "Detailed filters",
			listViewAriaLabel: "List view",
			iconViewAriaLabel: "Icon view",
			viewModeLegend: "View mode",
			coarseFilter: "all" as const,
			onCoarseFilterChange: noop,
			hiddenExtensions: args.filtersExpanded ? [".tmp"] : [],
			onToggleHiddenExtension: noop,
			hiddenFileTypes: [],
			onToggleHiddenFileType: noop,
			catalogHiddenPresetTypes:
				args.browseMode === "presetsCatalog" && args.filtersExpanded
					? (["script"] as const)
					: [],
			onToggleCatalogHiddenPresetType: noop,
			recursiveSearch: args.recursiveSearch,
			onToggleRecursiveSearch: noop,
			pathDisplay: args.pathDisplay,
			typeListLabel: "Type",
			quickFilterAriaLabel: "Quick filter",
			optionAllLabel: "All",
			optionMediaLabel: "Media",
			optionPresetsLabel: "Presets",
			optionScriptsLabel: "Scripts",
			optionFontsLabel: "Fonts",
			extensionHideLabel: "Hide",
			fileTypeHideLabel: "Hide",
			catalogPresetTypesHideLabel: "Hide",
			anchorsNoFiltersLabel: "No filters in anchor mode",
			recursiveSearchLabel: (s: string) => `Recursive: ${s}`,
			recursiveOnLabel: "on",
			recursiveOffLabel: "off",
		};
		return (
			<div className={css({ minWidth: "520px", padding: "2" })}>
				<BrowserHeader {...props} />
			</div>
		);
	},
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const WithSearchQuery: Story = {
	args: { searchDraft: "glow" },
};

export const IconView: Story = {
	args: { viewMode: "icons" },
};

export const FiltersExpanded: Story = {
	args: {
		filtersExpanded: true,
		recursiveSearch: true,
	},
};

export const AnchorsMode: Story = {
	args: { browseMode: "anchors", filtersExpanded: true },
};

export const CatalogMode: Story = {
	args: {
		browseMode: "presetsCatalog",
		filtersExpanded: true,
	},
};

export const GoUpDisabled: Story = {
	args: { goUpAvailable: false },
};

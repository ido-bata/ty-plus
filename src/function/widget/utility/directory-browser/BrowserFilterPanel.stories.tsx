import type { Meta, StoryObj } from "@storybook/react";
import type { PresetType } from "@/management/preset/contract";
import type { FileBrowserFileType } from "@/management/storage/file-browser-service";
import { BrowserFilterPanel } from "./BrowserFilterPanel";
import type { FileBrowserBrowseMode, FileBrowserFilter } from "./lib/types";

type Args = {
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
};

const baseArgs: Args = {
	browseMode: "filesystem",
	coarseFilter: "all",
	onCoarseFilterChange: () => undefined,
	hiddenExtensions: [],
	onToggleHiddenExtension: () => undefined,
	hiddenFileTypes: [],
	onToggleHiddenFileType: () => undefined,
	catalogHiddenPresetTypes: [],
	onToggleCatalogHiddenPresetType: () => undefined,
	recursiveSearch: false,
	onToggleRecursiveSearch: () => undefined,
};

const meta = {
	title: "DirectoryBrowser/BrowserFilterPanel",
	component: BrowserFilterPanel,
	args: {
		...baseArgs,
		typeListLabel: "Type",
		quickFilterAriaLabel: "Quick filter",
		optionAllLabel: "All",
		optionMediaLabel: "Media",
		optionPresetsLabel: "Presets",
		optionScriptsLabel: "Scripts",
		optionFontsLabel: "Fonts",
		extensionHideLabel: "Hide by extension",
		fileTypeHideLabel: "Hide by type",
		catalogPresetTypesHideLabel: "Hide catalog types",
		anchorsNoFiltersLabel: "No filters in anchor mode",
		recursiveSearchLabel: (state: string) => `Recursive search: ${state}`,
		recursiveOnLabel: "on",
		recursiveOffLabel: "off",
	},
	decorators: [
		(Story) => (
			<div style={{ minWidth: 320, padding: 8, background: "#252525" }}>
				<Story />
			</div>
		),
	],
} satisfies Meta<typeof BrowserFilterPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const MediaOnly: Story = {
	args: { coarseFilter: "media" },
};

export const SomeExtensionsHidden: Story = {
	args: { hiddenExtensions: [".ffx", ".json"] },
};

export const SomeFileTypesHidden: Story = {
	args: { hiddenFileTypes: ["ae-preset", "script"] },
};

export const RecursiveOn: Story = {
	args: { recursiveSearch: true },
};

export const AnchorsMode: Story = {
	args: { browseMode: "anchors" },
};

export const CatalogMode: Story = {
	args: { browseMode: "presetsCatalog" },
};

export const CatalogWithHiddenTypes: Story = {
	args: {
		browseMode: "presetsCatalog",
		catalogHiddenPresetTypes: ["plugin", "footage"],
	},
};

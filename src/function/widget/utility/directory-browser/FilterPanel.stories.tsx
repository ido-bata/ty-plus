import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "storybook/test";
import type { PresetType } from "@/management/preset/contract";
import type { FileBrowserFileType } from "@/management/storage/file-browser-service";
import { expectCanvasLayout } from "@/storybook/quality/layout";
import { BrowserFilterPanel } from "./FilterPanel";
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

// Issue #166: filter controls must satisfy the layout contract; the
// anchors mode is the explicit "no filters apply" empty state and only
// renders a muted paragraph — assert the message itself, not just
// capture success.
const playFilterLayout = async ({
	canvasElement,
}: {
	canvasElement: HTMLElement;
}): Promise<void> => {
	expectCanvasLayout(canvasElement);
};

export const Default: Story = {
	play: playFilterLayout,
};

export const MediaOnly: Story = {
	args: { coarseFilter: "media" },
	play: playFilterLayout,
};

export const SomeExtensionsHidden: Story = {
	args: { hiddenExtensions: [".ffx", ".json"] },
	play: playFilterLayout,
};

export const SomeFileTypesHidden: Story = {
	args: { hiddenFileTypes: ["ae-preset", "script"] },
	play: playFilterLayout,
};

export const RecursiveOn: Story = {
	args: { recursiveSearch: true },
	play: playFilterLayout,
};

export const AnchorsMode: Story = {
	args: { browseMode: "anchors" },
	play: async ({ canvasElement }) => {
		expect(canvasElement.textContent).toContain("No filters in anchor mode");
		// Anchors mode has no interactive controls — only the notice.
		expect(canvasElement.querySelector("button, select")).toBeNull();
		expectCanvasLayout(canvasElement);
	},
};

export const CatalogMode: Story = {
	args: { browseMode: "presetsCatalog" },
	play: playFilterLayout,
};

export const CatalogWithHiddenTypes: Story = {
	args: {
		browseMode: "presetsCatalog",
		catalogHiddenPresetTypes: ["plugin", "footage"],
	},
	play: playFilterLayout,
};

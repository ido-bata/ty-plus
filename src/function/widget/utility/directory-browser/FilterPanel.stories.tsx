import type { Meta, StoryObj } from "@storybook/react";
import { type JSX, useState } from "react";
import { expect } from "storybook/test";
import type { PresetType } from "@/management/preset/contract";
import type { FileBrowserFileType } from "@/management/storage/file-browser-service";
import { expectCanvasLayout } from "@/storybook/quality/layout";
import { css } from "@/styled-system/css";

import { renderFilterPanel } from "./filter-panel";
import type { FileBrowserBrowseMode, FileBrowserFilter } from "./types";

/**
 * Storybook harness for the directory-browser filter panel
 * (`renderFilterPanel`). The production caller (`Component.tsx`) owns all
 * filter state; this harness mirrors that contract so the chip toggles,
 * coarse `ListSelect`, and recursive-search button can be exercised
 * without the widget shell.
 */

type HarnessState = {
	browseMode: FileBrowserBrowseMode;
	coarseFilter: FileBrowserFilter;
	hiddenExtensions: readonly string[];
	hiddenFileTypes: readonly FileBrowserFileType[];
	catalogHiddenPresetTypes: readonly PresetType[];
	recursiveSearch: boolean;
};

const initialState: HarnessState = {
	browseMode: "filesystem",
	coarseFilter: "all",
	hiddenExtensions: [],
	hiddenFileTypes: [],
	catalogHiddenPresetTypes: [],
	recursiveSearch: false,
};

function FilterPanelHarness(props: {
	initial?: Partial<HarnessState>;
}): JSX.Element {
	const [state, setState] = useState<HarnessState>({
		...initialState,
		...props.initial,
	});
	const patch = (next: Partial<HarnessState>): void => {
		setState((prev) => ({ ...prev, ...next }));
	};
	return (
		<div
			className={css({
				display: "flex",
				width: "72",
				flexDirection: "column",
				gap: "2",
				padding: "3",
				backgroundColor: "surface.panel",
			})}
		>
			{renderFilterPanel({
				browseMode: state.browseMode,
				coarseFilter: state.coarseFilter,
				onCoarseFilterChange: (next) => patch({ coarseFilter: next }),
				hiddenExtensions: state.hiddenExtensions,
				onToggleHiddenExtension: (ext) =>
					patch({
						hiddenExtensions: state.hiddenExtensions.includes(ext)
							? state.hiddenExtensions.filter((e) => e !== ext)
							: [...state.hiddenExtensions, ext],
					}),
				hiddenFileTypes: state.hiddenFileTypes,
				onToggleHiddenFileType: (ft) =>
					patch({
						hiddenFileTypes: state.hiddenFileTypes.includes(ft)
							? state.hiddenFileTypes.filter((f) => f !== ft)
							: [...state.hiddenFileTypes, ft],
					}),
				catalogHiddenPresetTypes: state.catalogHiddenPresetTypes,
				onToggleCatalogHiddenPresetType: (pt) =>
					patch({
						catalogHiddenPresetTypes: state.catalogHiddenPresetTypes.includes(
							pt,
						)
							? state.catalogHiddenPresetTypes.filter((p) => p !== pt)
							: [...state.catalogHiddenPresetTypes, pt],
					}),
				recursiveSearch: state.recursiveSearch,
				onToggleRecursiveSearch: () =>
					patch({ recursiveSearch: !state.recursiveSearch }),
				typeListLabel: "Quick filter",
				quickFilterAriaLabel: "Quick filter",
				optionAllLabel: "All",
				optionMediaLabel: "Media",
				optionPresetsLabel: "Presets",
				optionScriptsLabel: "Scripts",
				optionFontsLabel: "Fonts",
				extensionHideLabel: "Hide extensions",
				fileTypeHideLabel: "Hide file types",
				catalogPresetTypesHideLabel: "Hide preset types",
				anchorsNoFiltersLabel: "No filters for anchor mode.",
				recursiveSearchLabel: (s) => `Recursive search: ${s}`,
				recursiveOnLabel: "on",
				recursiveOffLabel: "off",
			})}
		</div>
	);
}

type Args = {
	initial?: Partial<HarnessState>;
};

const meta = {
	title: "DirectoryBrowser/FilterPanel",
	args: {},
	argTypes: {
		initial: { control: false },
	},
	render: (args: Args) => <FilterPanelHarness initial={args.initial} />,
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Filesystem browse mode — coarse select plus extension/type chips. */
export const Default: Story = {
	play: async ({ canvasElement }) => {
		expectCanvasLayout(canvasElement, {
			requireRenderedSelector: "button",
		});
	},
};

/** Preset-catalog browse mode — the panel swaps to preset-type chips. */
export const PresetCatalog: Story = {
	args: { initial: { browseMode: "presetsCatalog" } },
	play: async ({ canvasElement }) => {
		expectCanvasLayout(canvasElement, {
			requireRenderedSelector: "button",
		});
	},
};

// Issue #166: the chips are real toggles — a click must flip
// `aria-pressed` (pressed = hidden by the filter) and swap the button
// variant. The post-play pressed state is what capture screenshots.
export const ChipToggleOnClick: Story = {
	play: async ({ canvasElement }) => {
		const chip = Array.from(
			canvasElement.querySelectorAll<HTMLButtonElement>("button"),
		).find((b) => b.textContent?.trim() === ".ffx");
		if (!chip) throw new Error(".ffx chip not found");
		await expect(chip.getAttribute("aria-pressed")).toBe("false");
		const { userEvent } = await import("vitest/browser");
		await userEvent.click(chip);
		await expect(chip.getAttribute("aria-pressed")).toBe("true");
	},
};

/** Recursive-search row toggles `aria-pressed` on click. */
export const RecursiveToggle: Story = {
	play: async ({ canvasElement }) => {
		const button = Array.from(
			canvasElement.querySelectorAll<HTMLButtonElement>("button"),
		).find((b) => b.textContent?.includes("Recursive search"));
		if (!button) throw new Error("recursive search button not found");
		await expect(button.getAttribute("aria-pressed")).toBe("false");
		const { userEvent } = await import("vitest/browser");
		await userEvent.click(button);
		await expect(button.getAttribute("aria-pressed")).toBe("true");
		await expect(button.textContent).toContain("on");
	},
};

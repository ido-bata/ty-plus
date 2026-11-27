import type { Meta, StoryObj } from "@storybook/react";
import { type JSX, useState } from "react";
import { expect } from "storybook/test";
import { expectCanvasLayout } from "@/storybook/quality/layout";
import { css } from "@/styled-system/css";

import { renderToolbar } from "./toolbar";

/**
 * Storybook harness for the directory-browser toolbar
 * (`renderToolbar`). The production caller (`Component.tsx`) owns
 * `filtersExpanded` / `viewMode` / `goUpAvailable`; this harness mirrors
 * that contract so the filter-toggle `aria-pressed` state and the
 * view-mode switch can be exercised without the widget shell.
 */

function ToolbarHarness(props: {
	initialFiltersExpanded?: boolean;
	initialViewMode?: "list" | "icons";
	goUpAvailable?: boolean;
}): JSX.Element {
	const [filtersExpanded, setFiltersExpanded] = useState(
		props.initialFiltersExpanded ?? false,
	);
	const [viewMode, setViewMode] = useState<"list" | "icons">(
		props.initialViewMode ?? "icons",
	);
	return (
		<div
			className={css({
				display: "flex",
				width: "full",
				padding: "2",
				backgroundColor: "surface.panel",
			})}
		>
			{renderToolbar({
				goUpAvailable: props.goUpAvailable ?? true,
				filtersExpanded,
				onRefresh: () => undefined,
				onGoUp: () => undefined,
				onBrowseDrives: () => undefined,
				onToggleFilters: () => setFiltersExpanded((v) => !v),
				viewMode,
				onViewModeChange: setViewMode,
				detailedFiltersLabel: "Detailed filters",
				listViewAriaLabel: "List view",
				iconViewAriaLabel: "Icon view",
				viewModeLegend: "Catalog layout",
				refreshLabel: "Refresh",
				goUpLabel: "Go up",
				browseDrivesLabel: "Browse drives",
			})}
		</div>
	);
}

type Args = {
	initialFiltersExpanded?: boolean;
	initialViewMode?: "list" | "icons";
	goUpAvailable?: boolean;
};

const meta = {
	title: "DirectoryBrowser/Toolbar",
	args: {
		initialFiltersExpanded: false,
		initialViewMode: "icons",
		goUpAvailable: true,
	},
	argTypes: {
		initialFiltersExpanded: { control: "boolean" },
		initialViewMode: {
			control: { type: "inline-radio" },
			options: ["list", "icons"],
		},
		goUpAvailable: { control: "boolean" },
	},
	render: (args: Args) => (
		<ToolbarHarness
			initialFiltersExpanded={args.initialFiltersExpanded}
			initialViewMode={args.initialViewMode}
			goUpAvailable={args.goUpAvailable}
		/>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Collapsed filters, icon view — the resting toolbar state. */
export const Default: Story = {
	play: async ({ canvasElement }) => {
		expectCanvasLayout(canvasElement, {
			requireRenderedSelector: "button",
		});
	},
};

/** Filters expanded — the toggle button carries `aria-pressed`. */
export const FiltersExpanded: Story = {
	args: { initialFiltersExpanded: true },
	play: async ({ canvasElement }) => {
		const toggle = canvasElement.querySelector<HTMLButtonElement>(
			'button[aria-label="Detailed filters"]',
		);
		if (!toggle) throw new Error("filter toggle not found");
		await expect(toggle.getAttribute("aria-pressed")).toBe("true");
	},
};

// Issue #166: the detailed-filters IconButton is a real toggle — a click
// must flip `aria-pressed` (and the shared `active` surface). The
// post-play pressed state is what capture screenshots.
export const ToggleFiltersOnClick: Story = {
	play: async ({ canvasElement }) => {
		const toggle = canvasElement.querySelector<HTMLButtonElement>(
			'button[aria-label="Detailed filters"]',
		);
		if (!toggle) throw new Error("filter toggle not found");
		await expect(toggle.getAttribute("aria-pressed")).toBe("false");
		const { userEvent } = await import("vitest/browser");
		await userEvent.click(toggle);
		await expect(toggle.getAttribute("aria-pressed")).toBe("true");
	},
};

/** Go-up disabled at the filesystem root — `disabled` must reach the button. */
export const GoUpDisabled: Story = {
	args: { goUpAvailable: false },
	play: async ({ canvasElement }) => {
		const goUp = canvasElement.querySelector<HTMLButtonElement>(
			'button[aria-label="Go up"]',
		);
		if (!goUp) throw new Error("go-up button not found");
		await expect(goUp.disabled).toBe(true);
	},
};

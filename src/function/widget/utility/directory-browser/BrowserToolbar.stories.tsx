import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "storybook/test";
import { expectCanvasLayout } from "@/storybook/quality/layout";
import { css } from "@/styled-system/css";
import { BrowserToolbar } from "./BrowserToolbar";

const noop = (): void => undefined;

type Args = {
	goUpAvailable: boolean;
	filtersExpanded: boolean;
	viewMode: "list" | "icons";
};

const baseArgs: Args = {
	goUpAvailable: true,
	filtersExpanded: false,
	viewMode: "list",
};

const meta = {
	title: "DirectoryBrowser/BrowserToolbar",
	args: baseArgs,
	argTypes: {
		viewMode: {
			control: { type: "inline-radio" },
			options: ["list", "icons"],
		},
	},
	render: (args: Args) => (
		<div className={css({ minWidth: "320px", padding: "2" })}>
			<BrowserToolbar
				goUpAvailable={args.goUpAvailable}
				filtersExpanded={args.filtersExpanded}
				onRefresh={noop}
				onGoUp={noop}
				onBrowseDrives={noop}
				onToggleFilters={noop}
				viewMode={args.viewMode}
				onViewModeChange={noop}
				detailedFiltersLabel="Detailed filters"
				listViewAriaLabel="List view"
				iconViewAriaLabel="Icon view"
				viewModeLegend="View mode"
			/>
		</div>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

// Issue #166: every toolbar state must satisfy the layout contract —
// the icon buttons are the interactive surface.
const playToolbarLayout = async ({
	canvasElement,
}: {
	canvasElement: HTMLElement;
}): Promise<void> => {
	expectCanvasLayout(canvasElement, {
		requireRenderedSelector: "button",
	});
};

const goUpButton = (canvasElement: HTMLElement): HTMLButtonElement => {
	const button = canvasElement.querySelector<HTMLButtonElement>(
		"button[aria-label='Go up']",
	);
	if (!button) throw new Error("go-up button not found");
	return button;
};

export const Default: Story = {
	play: async ({ canvasElement }) => {
		await playToolbarLayout({ canvasElement });
		expect(goUpButton(canvasElement).disabled).toBe(false);
	},
};

export const FiltersExpanded: Story = {
	args: { filtersExpanded: true },
	play: playToolbarLayout,
};

export const IconView: Story = {
	args: { viewMode: "icons" },
	play: playToolbarLayout,
};

/**
 * Filesystem root / empty-directory state: `goUpAvailable=false` disables
 * the go-up affordance while the rest of the toolbar stays interactive.
 */
export const GoUpDisabled: Story = {
	args: { goUpAvailable: false },
	play: async ({ canvasElement }) => {
		await playToolbarLayout({ canvasElement });
		expect(goUpButton(canvasElement).disabled).toBe(true);
	},
};

export const IconsWithFilters: Story = {
	args: { viewMode: "icons", filtersExpanded: true },
	play: playToolbarLayout,
};

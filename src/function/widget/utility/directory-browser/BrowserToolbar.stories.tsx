import type { Meta, StoryObj } from "@storybook/react";
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

export const Default: Story = {};

export const FiltersExpanded: Story = {
	args: { filtersExpanded: true },
};

export const IconView: Story = {
	args: { viewMode: "icons" },
};

export const GoUpDisabled: Story = {
	args: { goUpAvailable: false },
};

export const IconsWithFilters: Story = {
	args: { viewMode: "icons", filtersExpanded: true },
};

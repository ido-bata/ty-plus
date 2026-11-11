import type { Meta, StoryObj } from "@storybook/react";

import { DirectoryBrowserFooter } from "./DirectoryBrowserFooter";
import type { DirectoryBrowserViewMode } from "./DirectoryBrowserViewModeToggle";

type Args = {
	viewMode: DirectoryBrowserViewMode;
	showSelectedSummary: boolean;
	summary: string | { files: number; folders: number };
};

const baseArgs: Args = {
	viewMode: "list",
	showSelectedSummary: true,
	summary: "3 files selected",
};

const renderFooter = (args: Args) => (
	<DirectoryBrowserFooter
		viewMode={args.viewMode}
		showSelectedSummary={args.showSelectedSummary}
		selectedSummary={
			typeof args.summary === "string"
				? args.summary
				: { files: args.summary.files, folders: args.summary.folders }
		}
		onViewModeChange={() => undefined}
	/>
);

const meta = {
	title: "DirectoryBrowser/DirectoryBrowserFooter",
	args: baseArgs,
	argTypes: {
		viewMode: {
			control: { type: "inline-radio" },
			options: ["list", "icons"],
		},
		showSelectedSummary: { control: "boolean" },
		summary: { control: "text" },
	},
	decorators: [
		(Story) => (
			<div style={{ width: 320 }}>
				<Story />
			</div>
		),
	],
	render: renderFooter,
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const IconView: Story = {
	args: { viewMode: "icons" },
};

export const Counts: Story = {
	args: { summary: { files: 4, folders: 2 } },
};

export const NoSummary: Story = {
	args: { showSelectedSummary: false },
};

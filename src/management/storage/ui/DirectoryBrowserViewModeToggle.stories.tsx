import type { Meta, StoryObj } from "@storybook/react";
import { css } from "@/styled-system/css";

import {
	type DirectoryBrowserViewMode,
	DirectoryBrowserViewModeToggle,
} from "./DirectoryBrowserViewModeToggle";

type Args = {
	viewMode: DirectoryBrowserViewMode;
};

const baseArgs: Args = {
	viewMode: "list",
};

const renderToggle = (args: Args) => (
	<DirectoryBrowserViewModeToggle
		viewMode={args.viewMode}
		onChange={() => undefined}
	/>
);

const meta = {
	title: "DirectoryBrowser/DirectoryBrowserViewModeToggle",
	args: baseArgs,
	argTypes: {
		viewMode: {
			control: { type: "inline-radio" },
			options: ["list", "icons"],
		},
	},
	decorators: [
		(Story) => (
			<div
				className={css({ bg: "surface.widget", p: "2" })}
				style={{ width: 120 }}
			>
				<Story />
			</div>
		),
	],
	render: renderToggle,
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const ListSelected: Story = {};

export const IconsSelected: Story = {
	args: { viewMode: "icons" },
};

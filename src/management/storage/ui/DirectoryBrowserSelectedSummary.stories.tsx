import type { Meta, StoryObj } from "@storybook/react";
import { css } from "@/styled-system/css";

import {
	DirectoryBrowserSelectedSummary,
	type DirectoryBrowserSummary,
} from "./DirectoryBrowserSelectedSummary";

type Args = {
	summary: DirectoryBrowserSummary;
};

const baseArgs: Args = {
	summary: "2 files selected",
};

const meta = {
	title: "DirectoryBrowser/DirectoryBrowserSelectedSummary",
	component: DirectoryBrowserSelectedSummary,
	args: baseArgs,
	argTypes: {
		summary: { control: "text" },
	},
	decorators: [
		(Story) => (
			<div
				style={{ width: 240 }}
				className={css({
					bg: "surface.widget",
					p: "2",
					fontSize: "shell-text-sm",
					color: "text.primary",
				})}
			>
				<Story />
			</div>
		),
	],
} satisfies Meta<typeof DirectoryBrowserSelectedSummary>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TextLabel: Story = {};

export const CountsOnly: Story = {
	args: { summary: { files: 3, folders: 0 } },
};

export const Mixed: Story = {
	args: { summary: { files: 2, folders: 1 } },
};

export const Empty: Story = {
	args: { summary: { files: 0, folders: 0 } },
};

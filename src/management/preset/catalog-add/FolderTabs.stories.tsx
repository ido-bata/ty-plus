import type { Meta, StoryObj } from "@storybook/react";
import { css } from "@/styled-system/css";

import type { PresetAddFolderType } from "./archive-types";
import { FolderTabs } from "./FolderTabs";

type Args = {
	activeTab: PresetAddFolderType;
};

const baseArgs: Args = {
	activeTab: "presets",
};

const decoratorBoxClass = css({
	width: "24rem",
	padding: "2",
});

const meta = {
	title: "Preset/CatalogAdd/FolderTabs",
	args: baseArgs,
	argTypes: {
		activeTab: {
			control: { type: "select" },
			options: ["presets", "scripts", "plugins", "other"],
		},
	},
	render: (args: Args) => (
		<div className={decoratorBoxClass}>
			<FolderTabs activeTab={args.activeTab} onTabChange={() => undefined} />
		</div>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const Scripts: Story = {
	args: { activeTab: "scripts" },
};

export const Plugins: Story = {
	args: { activeTab: "plugins" },
};

export const Other: Story = {
	args: { activeTab: "other" },
};

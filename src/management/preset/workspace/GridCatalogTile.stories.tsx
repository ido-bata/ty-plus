import type { Meta, StoryObj } from "@storybook/react";
import type { Preset } from "@/management/preset/contract";
import { presetIconText } from "@/management/preset/contract";
import { css } from "@/styled-system/css";
import { GridCatalogTile } from "./GridCatalogTile";

const makePreset = (id: string): Preset => ({
	id,
	type: "preset",
	title: id,
	filePath: `ty-plus://${id}`,
	icon: presetIconText(id.slice(0, 2).toUpperCase() || "PR"),
});

type Args = {
	hasPreset: boolean;
	label: string;
};

const baseArgs: Args = {
	hasPreset: true,
	label: "Grid catalog tile",
};

const decoratorBoxClass = css({
	height: "32",
	width: "32",
});

const meta = {
	title: "Preset/Workspace/GridCatalogTile",
	args: baseArgs,
	argTypes: {
		hasPreset: { control: "boolean" },
		label: { control: "text" },
	},
	decorators: [
		(Story) => (
			<div className={decoratorBoxClass}>
				<Story />
			</div>
		),
	],
	render: (args: Args) => (
		<GridCatalogTile
			preset={args.hasPreset ? makePreset("story") : undefined}
			label={args.label}
		/>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const Empty: Story = {
	args: { hasPreset: false, label: "?" },
};

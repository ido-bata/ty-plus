import type { Meta, StoryObj } from "@storybook/react";
import type { Preset } from "@/management/preset/contract";
import { presetIconText } from "@/management/preset/contract";
import { css } from "@/styled-system/css";
import { GroupContainerCatalogTile } from "./ContainerCatalogTile";

const makeGroupPreset = (id: string, members: number): Preset => ({
	id,
	type: "preset",
	title: id,
	filePath: `ty-plus://${id}`,
	icon: presetIconText(id.slice(0, 2).toUpperCase() || "GP"),
	data: { members: Array.from({ length: members }, (_, i) => `m${i}`) },
});

type Args = {
	id: string;
	members: number;
};

const baseArgs: Args = {
	id: "group-1",
	members: 5,
};

const decoratorBoxClass = css({
	height: "8rem",
	width: "8rem",
});

const meta = {
	title: "Preset/Group/ContainerCatalogTile",
	args: baseArgs,
	argTypes: {
		id: { control: "text" },
		members: { control: { type: "range", min: 0, max: 120, step: 1 } },
	},
	decorators: [
		(Story) => (
			<div className={decoratorBoxClass}>
				<Story />
			</div>
		),
	],
	render: (args: Args) => (
		<GroupContainerCatalogTile
			preset={makeGroupPreset(args.id, args.members)}
			label={args.id}
		/>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const Many: Story = {
	args: { members: 25 },
};

export const Overflow: Story = {
	args: { members: 150 },
};

export const Empty: Story = {
	args: { members: 0 },
};

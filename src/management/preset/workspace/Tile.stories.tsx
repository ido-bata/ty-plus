import type { Meta, StoryObj } from "@storybook/react";
import type { Preset } from "@/management/preset/contract";
import { presetIconText } from "@/management/preset/contract";
import { css } from "@/styled-system/css";
import { Tile } from "./Tile";

const noop = (): void => undefined;

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
	label: "My preset",
};

const decoratorBoxClass = css({
	height: "8rem",
	width: "8rem",
});

const meta = {
	title: "Preset/Workspace/Tile",
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
		<Tile
			preset={args.hasPreset ? makePreset("story") : undefined}
			label={args.label}
			onHoverChange={noop}
		/>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const Missing: Story = {
	args: { hasPreset: false, label: "missing-row" },
};

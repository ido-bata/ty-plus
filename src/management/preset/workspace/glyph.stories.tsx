import type { Meta, StoryObj } from "@storybook/react";
import type { Preset } from "@/management/preset/contract";
import {
	presetIconCanvas,
	presetIconEmoji,
	presetIconImage,
	presetIconText,
} from "@/management/preset/contract";
import { css } from "@/styled-system/css";
import { WorkspacePresetGlyph } from "./glyph";

const makePreset = (id: string, icon: Preset["icon"]): Preset => ({
	id,
	type: "preset",
	title: id,
	filePath: `ty-plus://${id}`,
	icon,
});

const baseArgs = {
	preset: makePreset("alpha", presetIconText("AB")),
};

const decoratorBoxClass = css({
	height: "32",
	width: "32",
});

const meta = {
	title: "Preset/Workspace/Glyph",
	component: WorkspacePresetGlyph,
	args: baseArgs,
	argTypes: {
		preset: { control: false },
	},
	decorators: [
		(Story) => (
			<div className={decoratorBoxClass}>
				<Story />
			</div>
		),
	],
} satisfies Meta<typeof baseArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Emoji: Story = {
	args: { preset: makePreset("emoji", presetIconEmoji("✨")) },
};

export const LongText: Story = {
	args: { preset: makePreset("long", presetIconText("Header")) },
};

export const Canvas: Story = {
	args: {
		preset: makePreset(
			"curve",
			presetIconCanvas({ cubic: [0.42, 0, 0.58, 1] }),
		),
	},
};

export const ImagePath: Story = {
	args: {
		preset: makePreset("img", presetIconImage("https://placehold.co/120")),
	},
};

export const Missing: Story = {
	render: () => (
		<div className={decoratorBoxClass}>
			<WorkspacePresetGlyph
				preset={makePreset("missing", presetIconText("?"))}
			/>
		</div>
	),
};

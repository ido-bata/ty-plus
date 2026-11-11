import type { Meta, StoryObj } from "@storybook/react";
import type { Preset } from "@/management/preset/contract";
import { presetIconText } from "@/management/preset/contract";
import { createPresetIconDraft } from "@/management/preset/icon-editor";
import { css } from "@/styled-system/css";
import { ToolDialogIconSection } from "./DialogIconSection";

const basePreset: Preset = {
	id: "preview",
	type: "preset",
	title: "Preview",
	filePath: "ty-plus://preview",
	icon: presetIconText("PR"),
};

type Args = {
	iconType: "text" | "emoji" | "image" | "canvas";
};

const baseArgs: Args = {
	iconType: "text",
};

const decoratorBoxClass = css({
	width: "28rem",
	padding: "2",
});

const meta = {
	title: "Preset/ToolShell/DialogIconSection",
	args: baseArgs,
	argTypes: {
		iconType: {
			control: { type: "select" },
			options: ["text", "emoji", "image", "canvas"],
		},
	},
	decorators: [
		(Story) => (
			<div className={decoratorBoxClass}>
				<Story />
			</div>
		),
	],
	render: (args: Args) => {
		const draft = createPresetIconDraft("PR");
		if (args.iconType === "emoji") draft.emoji = "✨";
		if (args.iconType === "image") draft.imagePath = "https://placehold.co/120";
		if (args.iconType === "canvas") draft.canvasCubic = [0.42, 0, 0.58, 1];
		return (
			<ToolDialogIconSection
				iconDraft={{ ...draft, type: args.iconType }}
				onIconDraftChange={() => undefined}
				browseDir="/preset/root"
				label="Icon"
				previewPreset={basePreset}
			/>
		);
	},
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const Emoji: Story = {
	args: { iconType: "emoji" },
};

export const Image: Story = {
	args: { iconType: "image" },
};

export const Canvas: Story = {
	args: { iconType: "canvas" },
};

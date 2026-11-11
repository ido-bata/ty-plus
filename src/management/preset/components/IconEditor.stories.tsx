import type { Meta, StoryObj } from "@storybook/react";
import type { Preset } from "@/management/preset/contract";
import { presetIconText } from "@/management/preset/contract";
import { createPresetIconDraft } from "@/management/preset/icon-editor";
import { css } from "@/styled-system/css";
import { IconEditor } from "./IconEditor";

const basePreset: Preset = {
	id: "preview",
	type: "preset",
	title: "Preview",
	filePath: "ty-plus://preview",
	icon: presetIconText("PR"),
};

type Args = {
	iconType: "text" | "emoji" | "image";
};

const baseArgs: Args = {
	iconType: "text",
};

const decoratorBoxClass = css({
	width: "28rem",
	padding: "2",
});

const previewBoxClass = css({
	height: "full",
	width: "full",
});

const previewLabelClass = css({
	display: "grid",
	height: "full",
	width: "full",
	placeItems: "center",
	backgroundColor: "surface.widget",
	color: "text.primary",
	fontSize: "sm",
});

const meta = {
	title: "Preset/Components/IconEditor",
	args: baseArgs,
	argTypes: {
		iconType: {
			control: { type: "select" },
			options: ["text", "emoji", "image"],
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
		return (
			<IconEditor
				draft={{ ...draft, type: args.iconType }}
				onChange={() => undefined}
				browseDir="/preset/root"
				preview={
					<div className={previewBoxClass}>
						<div className={previewLabelClass}>Preview</div>
					</div>
				}
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

export const Unframed: Story = {
	render: () => (
		<IconEditor
			draft={createPresetIconDraft("AB")}
			onChange={() => undefined}
			browseDir="/preset/root"
			framed={false}
		/>
	),
};

export const WithPresetPreview: Story = {
	render: () => (
		<IconEditor
			draft={createPresetIconDraft("HD")}
			onChange={() => undefined}
			browseDir="/preset/root"
			preview={<div className={previewLabelClass}>{basePreset.id}</div>}
		/>
	),
};

import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "storybook/test";
import type { Preset } from "@/management/preset/contract";
import {
	createPresetIconDraft,
	presetIconDraftToPresetIcon,
} from "@/management/preset/icon/editor-state";
import { css } from "@/styled-system/css";
import { ToolDialogIconSection } from "./IconSection";

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
	title: "Preset/ToolShell/Dialog/IconSection",
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
		const draft = {
			...createPresetIconDraft("PR"),
			type: args.iconType,
		};
		if (args.iconType === "emoji") draft.emoji = "✨";
		if (args.iconType === "image") draft.imagePath = "https://placehold.co/120";
		if (args.iconType === "canvas") draft.canvasCubic = [0.42, 0, 0.58, 1];
		// ToolDialog derives the preview preset from the live icon draft
		// (ToolDialog.tsx `previewPreset`) — mirror that so each tab shows
		// its own icon instead of the fixed "PR" text (#459).
		const previewPreset: Preset = {
			id: "icon-preview",
			type: "preset",
			// i18n-exempt: synthetic preset record title for the glyph preview, never rendered as a label
			title: "Preview",
			filePath: "ty-plus://icon-preview",
			icon: presetIconDraftToPresetIcon(draft) ?? {
				type: "text",
				param: { text: "PR" },
			},
		};
		return (
			<ToolDialogIconSection
				iconDraft={draft}
				onIconDraftChange={() => undefined}
				browseDir="/preset/root"
				label="Icon"
				previewPreset={previewPreset}
			/>
		);
	},
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const Emoji: Story = {
	args: { iconType: "emoji" },
	play: async ({ canvasElement }) => {
		// #459: the preview must reflect the emoji draft, not the fixed
		// "PR" text icon every tab used to share.
		const glyph = canvasElement.querySelector(".ws-preset-icon--emoji");
		expect(glyph?.textContent).toContain("✨");
	},
};

export const Image: Story = {
	args: { iconType: "image" },
	play: async ({ canvasElement }) => {
		expect(
			canvasElement.querySelector(
				".ws-preset-icon--image[data-glyph-cached-image]",
			),
		).not.toBeNull();
	},
};

export const Canvas: Story = {
	args: { iconType: "canvas" },
	play: async ({ canvasElement }) => {
		expect(
			canvasElement.querySelector(".ws-preset-icon--canvas canvas"),
		).not.toBeNull();
	},
};

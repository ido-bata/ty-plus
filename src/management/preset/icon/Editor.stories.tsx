import type { Meta, StoryObj } from "@storybook/react";
import type { Preset } from "@/management/preset/contract";
import { presetIconText } from "@/management/preset/contract";
import { createPresetIconDraft } from "@/management/preset/icon/editor-state";
import { expectCanvasLayout } from "@/storybook/quality/layout";
import { css } from "@/styled-system/css";
import { IconEditor } from "./Editor";

const basePreset: Preset = {
	id: "preview",
	type: "preset",
	title: "Preview",
	filePath: "ty-plus://preview",
	icon: presetIconText("PR"),
};

type Args = {
	iconType: "text" | "emoji" | "image";
	/**
	 * Container width in rem. The preview tile size must stay constant across
	 * widths — narrow containers reproduce the cramped right column that used
	 * to distort the preview grid.
	 */
	containerWidthRem: number;
};

const baseArgs: Args = {
	iconType: "text",
	containerWidthRem: 28,
};

const decoratorBoxClass = css({
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
		containerWidthRem: {
			control: { type: "range", min: 14, max: 48, step: 2 },
		},
	},
	decorators: [
		(Story, context) => {
			const widthRem =
				(context.args as Args | undefined)?.containerWidthRem ??
				baseArgs.containerWidthRem;
			return (
				<div className={decoratorBoxClass} style={{ width: `${widthRem}rem` }}>
					<Story />
				</div>
			);
		},
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

export const Default: Story = {
	// Issue #194: every rendered control (fields, browse button, preview)
	// must sit inside the viewport unclipped; #192 owns any DOM changes
	// this contract then re-verifies.
	play: async ({ canvasElement }) => {
		expectCanvasLayout(canvasElement);
	},
};

export const Emoji: Story = {
	args: { iconType: "emoji" },
};

export const Image: Story = {
	args: { iconType: "image" },
};

/**
 * Narrow container: reproduces the cramped right column that used to make the
 * preview tile grow/shrink with field content height.
 */
export const NarrowContainer: Story = {
	args: { containerWidthRem: 16 },
};

/** Wide container: the preview tile must stay the same size as NarrowContainer. */
export const WideContainer: Story = {
	args: { containerWidthRem: 44 },
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
	play: async ({ canvasElement }) => {
		expectCanvasLayout(canvasElement);
	},
	render: () => (
		<IconEditor
			draft={createPresetIconDraft("HD")}
			onChange={() => undefined}
			browseDir="/preset/root"
			preview={<div className={previewLabelClass}>{basePreset.id}</div>}
		/>
	),
};

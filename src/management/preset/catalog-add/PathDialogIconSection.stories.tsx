import type { Meta, StoryObj } from "@storybook/react";
import { css } from "@/styled-system/css";

import { createArchiveIconDraft } from "./archive-icon";
import { PathDialogIconSection } from "./PathDialogIconSection";

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

const meta = {
	title: "Preset/CatalogAdd/PathDialogIconSection",
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
		const draft = createArchiveIconDraft("PR");
		if (args.iconType === "emoji") draft.emoji = "✨";
		if (args.iconType === "image") draft.imagePath = "https://placehold.co/120";
		return (
			<PathDialogIconSection
				draft={{ ...draft, type: args.iconType }}
				onChange={() => undefined}
				browseDir="/preset/root"
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

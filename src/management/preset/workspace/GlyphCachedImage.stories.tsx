import type { Meta, StoryObj } from "@storybook/react";
import { css } from "@/styled-system/css";

import { GlyphCachedImage } from "./GlyphCachedImage";

type Args = {
	imagePath: string;
	fallbackClassName: string;
};

const baseArgs: Args = {
	imagePath: "https://placehold.co/120x120/png",
	fallbackClassName: "",
};

const decoratorBoxClass = css({
	height: "32",
	width: "32",
});

const meta = {
	title: "Preset/Workspace/GlyphCachedImage",
	args: baseArgs,
	argTypes: {
		imagePath: { control: "text" },
		fallbackClassName: { control: "text" },
	},
	decorators: [
		(Story) => (
			<div className={decoratorBoxClass}>
				<Story />
			</div>
		),
	],
	render: (args: Args) => (
		<GlyphCachedImage
			imagePath={args.imagePath}
			fallbackClassName={args.fallbackClassName}
		/>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const EmptyPath: Story = {
	args: { imagePath: "" },
};

export const LocalPath: Story = {
	args: { imagePath: "/preset/root/icon.png" },
};

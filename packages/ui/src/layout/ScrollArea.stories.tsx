import type { Meta, StoryObj } from "@storybook/react";
import { css } from "@/styled-system/css";

import { ScrollArea } from "./ScrollArea";

type Args = {
	gutterStable: boolean;
};

const baseArgs: Args = {
	gutterStable: true,
};

const renderScroll = (args: Args) => (
	<ScrollArea
		gutterStable={args.gutterStable}
		className={css({ width: "full" })}
	>
		<div
			className={css({
				display: "flex",
				flexDirection: "column",
				gap: "2",
				p: "2",
			})}
		>
			{Array.from({ length: 12 }).map((_, i) => (
				<div
					key={i}
					className={css({
						borderRadius: "shell-sm",
						borderWidth: "1px",
						borderStyle: "solid",
						borderColor: "border.default",
						bg: "surface.widget",
						p: "2",
						fontSize: "sm",
						color: "text.primary",
					})}
				>
					Row {i + 1}
				</div>
			))}
		</div>
	</ScrollArea>
);

const meta = {
	title: "Shared/Layout/ScrollArea",
	args: baseArgs,
	argTypes: {
		gutterStable: { control: "boolean" },
	},
	decorators: [
		(Story) => (
			<div style={{ height: 200, display: "flex" }}>
				<Story />
			</div>
		),
	],
	render: renderScroll,
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const NoGutter: Story = {
	args: { gutterStable: false },
};

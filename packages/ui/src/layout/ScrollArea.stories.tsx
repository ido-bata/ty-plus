import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "storybook/test";
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
						borderWidth: "hairline",
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

export const Default: Story = {
	play: async ({ canvasElement }) => {
		const area = canvasElement.querySelector<HTMLElement>(".ty-scroll-area");
		expect(area).not.toBeNull();
		if (!area) return;

		// The frame must actually overflow so the scrollbar contract is
		// exercised.
		expect(area.scrollHeight).toBeGreaterThan(area.clientHeight);

		// Issue #741: the scrollbar thumb must be visible at rest — a fully
		// transparent thumb gives zero overflow affordance. `scrollbar-color`
		// computes to "<thumb> <track>"; assert the thumb alpha is non-zero.
		const scrollbarColor = getComputedStyle(area).scrollbarColor;
		const thumbMatch = scrollbarColor.match(/rgba?\([^)]*,\s*([\d.]+)\)/);
		expect(thumbMatch).not.toBeNull();
		expect(Number.parseFloat(thumbMatch?.[1] ?? "0")).toBeGreaterThan(0);
	},
};

export const NoGutter: Story = {
	args: { gutterStable: false },
};

import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "storybook/test";
import { assertScrollbarThumbVisible } from "@/storybook/quality/fit";
import { css } from "@/styled-system/css";

import { ScrollArea } from "./ScrollArea";

type Args = {
	gutterStable: boolean;
	itemCount: number;
};

const baseArgs: Args = {
	gutterStable: true,
	itemCount: 12,
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
			{Array.from({ length: args.itemCount }).map((_, i) => (
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
		itemCount: { control: { type: "number", min: 1, max: 24 } },
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

		// Issue #741 / #726: the scrollbar thumb must be visible at rest —
		// a fully transparent thumb gives zero overflow affordance. The
		// shared helper asserts both the overflow and the thumb alpha.
		assertScrollbarThumbVisible(area);
	},
};

export const NoGutter: Story = {
	// Issue #769: with overflowing content the scrollbar allocates its own
	// gutter regardless of `gutterStable`, so the prop is invisible. Use a
	// non-overflowing row count — `stable` still reserves the gutter track
	// while `gutterStable={false}` does not.
	args: { gutterStable: false, itemCount: 3 },
	play: async ({ canvasElement }) => {
		const area = canvasElement.querySelector<HTMLElement>(".ty-scroll-area");
		expect(area).not.toBeNull();
		if (!area) return;
		expect(area.scrollHeight).toBeLessThanOrEqual(area.clientHeight + 1);
		expect(getComputedStyle(area).scrollbarGutter).toBe("auto");
	},
};

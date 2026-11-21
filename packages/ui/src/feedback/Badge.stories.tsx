import type { Meta, StoryObj } from "@storybook/react";
import { expect, within } from "storybook/test";
import { css } from "@/styled-system/css";

import { Badge } from "./Badge";

const meta = {
	title: "Shared/Feedback/Badge",
	component: Badge,
	argTypes: {
		tone: {
			control: { type: "select" },
			options: ["neutral", "accent", "success", "warning", "error"],
		},
		children: { control: "text" },
	},
	args: {
		tone: "neutral",
		children: "Badge",
	},
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

const row = css({
	display: "flex",
	flexWrap: "wrap",
	gap: "3",
	alignItems: "center",
});

export const Playground: Story = {};

export const Tones: Story = {
	render: (args) => (
		<div className={row}>
			{(["neutral", "accent", "success", "warning", "error"] as const).map(
				(tone) => (
					<Badge {...args} key={tone} tone={tone}>
						{tone}
					</Badge>
				),
			)}
		</div>
	),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		for (const tone of ["neutral", "accent", "success", "warning", "error"]) {
			expect(canvas.getByText(tone)).toBeVisible();
		}
	},
};

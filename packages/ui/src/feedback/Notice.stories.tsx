import type { Meta, StoryObj } from "@storybook/react";
import { expect, within } from "storybook/test";
import { css } from "@/styled-system/css";

import { Notice } from "./Notice";

const meta = {
	title: "Shared/Feedback/Notice",
	component: Notice,
	argTypes: {
		tone: {
			control: { type: "select" },
			options: ["info", "success", "warning", "error"],
		},
		children: { control: "text" },
	},
	args: {
		tone: "info",
		children: "Something worth noting.",
	},
} satisfies Meta<typeof Notice>;

export default meta;
type Story = StoryObj<typeof meta>;

const stack = css({
	display: "flex",
	flexDirection: "column",
	gap: "3",
	maxWidth: "32rem",
});

export const Playground: Story = {};

export const Tones: Story = {
	render: (args) => (
		<div className={stack}>
			{(["info", "success", "warning", "error"] as const).map((tone) => (
				<Notice {...args} key={tone} tone={tone}>
					{tone} notice
				</Notice>
			))}
		</div>
	),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		for (const tone of ["info", "success", "warning", "error"]) {
			expect(canvas.getByText(`${tone} notice`)).toBeVisible();
		}
	},
};

import type { Meta, StoryObj } from "@storybook/react";
import { expect, within } from "storybook/test";
import { css } from "@/styled-system/css";

import { Surface } from "./Surface";

const meta = {
	title: "Shared/Layout/Surface",
	component: Surface,
	argTypes: {
		variant: {
			control: { type: "select" },
			options: ["default", "raised", "overlay", "inset"],
		},
		padding: {
			control: { type: "select" },
			options: ["none", "sm", "md", "lg"],
		},
		children: { control: "text" },
	},
	args: {
		variant: "default",
		padding: "md",
		children: "Surface content",
	},
} satisfies Meta<typeof Surface>;

export default meta;
type Story = StoryObj<typeof meta>;

const row = css({
	display: "flex",
	flexWrap: "wrap",
	gap: "4",
	alignItems: "flex-start",
});

export const Playground: Story = {};

export const Variants: Story = {
	render: (args) => (
		<div className={row}>
			<Surface {...args} variant="default" className={css({ width: "12rem" })}>
				default
			</Surface>
			<Surface {...args} variant="raised" className={css({ width: "12rem" })}>
				raised
			</Surface>
			<Surface {...args} variant="overlay" className={css({ width: "12rem" })}>
				overlay
			</Surface>
			<Surface {...args} variant="inset" className={css({ width: "12rem" })}>
				inset
			</Surface>
		</div>
	),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		for (const label of ["default", "raised", "overlay", "inset"]) {
			expect(canvas.getByText(label)).toBeVisible();
		}
	},
};

export const Paddings: Story = {
	render: (args) => (
		<div className={row}>
			{(["none", "sm", "md", "lg"] as const).map((p) => (
				<Surface
					{...args}
					key={p}
					padding={p}
					className={css({ width: "10rem" })}
				>
					{p}
				</Surface>
			))}
		</div>
	),
};

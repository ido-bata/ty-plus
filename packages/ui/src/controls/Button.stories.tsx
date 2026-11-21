import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "storybook/test";
import { css } from "@/styled-system/css";

import { Button } from "./Button";

const meta = {
	title: "Shared/Controls/Button",
	component: Button,
	argTypes: {
		variant: {
			control: { type: "select" },
			options: [
				"bare",
				"primary",
				"default",
				"secondary",
				"outline",
				"ghost",
				"danger",
			],
		},
		uiSize: {
			control: { type: "select" },
			options: ["sm", "md", "lg"],
		},
		fullWidth: { control: "boolean" },
		disabled: { control: "boolean" },
		children: { control: "text" },
		start: { control: false },
		end: { control: false },
	},
	args: {
		variant: "default",
		uiSize: "md",
		fullWidth: false,
		disabled: false,
		children: "Click me",
	},
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Disabled: Story = {
	args: { disabled: true },
};

// Issue #146: hover-state capture — a real-pointer hover must lift the
// button to `interactive.hover`; the post-play state is screenshotted.
export const Hovered: Story = {
	play: async ({ canvasElement }) => {
		const button = canvasElement.querySelector("button");
		if (!button) throw new Error("button not found");
		const { userEvent } = await import("vitest/browser");
		const resting = getComputedStyle(button).backgroundColor;
		await userEvent.hover(button);
		await expect(button.matches(":hover")).toBe(true);
		await new Promise((resolve) => setTimeout(resolve, 300));
		await expect(getComputedStyle(button).backgroundColor).not.toBe(resting);
	},
};

export const AllVariants: Story = {
	render: (args) => (
		<div className={css({ display: "flex", flexWrap: "wrap", gap: "2" })}>
			<Button {...args} variant="primary">
				Primary
			</Button>
			<Button {...args} variant="default">
				Default
			</Button>
			<Button {...args} variant="secondary">
				Secondary
			</Button>
			<Button {...args} variant="outline">
				Outline
			</Button>
			<Button {...args} variant="ghost">
				Ghost
			</Button>
			<Button {...args} variant="danger">
				Danger
			</Button>
		</div>
	),
};

export const AllSizes: Story = {
	render: (args) => (
		<div className={css({ display: "flex", alignItems: "center", gap: "2" })}>
			<Button {...args} uiSize="sm">
				Small
			</Button>
			<Button {...args} uiSize="md">
				Medium
			</Button>
			<Button {...args} uiSize="lg">
				Large
			</Button>
		</div>
	),
};

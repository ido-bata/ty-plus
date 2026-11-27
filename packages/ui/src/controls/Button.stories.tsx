import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "storybook/test";
import { borderTopColor, resolveBorderToken } from "@/storybook/quality/border";
import { expectCanvasLayout } from "@/storybook/quality/layout";
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

export const Default: Story = {
	// Issue #194: initial-state layout contract — every rendered control
	// must sit inside the viewport and not be clipped by hidden-overflow
	// ancestors. Capture success alone is not a visual pass.
	play: async ({ canvasElement }) => {
		expectCanvasLayout(canvasElement);
	},
};

export const Disabled: Story = {
	args: { disabled: true },
};

// Issue #146: hover-state capture — a real-pointer hover must lift the
// button to `interactive.hover`; the post-play state is screenshotted.
export const Hovered: Story = {
	play: async ({ canvasElement }) => {
		expectCanvasLayout(canvasElement);
		const button = canvasElement.querySelector("button");
		if (!button) throw new Error("button not found");
		const { userEvent } = await import("vitest/browser");
		const resting = getComputedStyle(button).backgroundColor;
		await userEvent.hover(button);
		await expect(button.matches(":hover")).toBe(true);
		await new Promise((resolve) => setTimeout(resolve, 300));
		await expect(getComputedStyle(button).backgroundColor).not.toBe(resting);
		expectCanvasLayout(canvasElement);
	},
};

// Issue #194: keyboard focus must reach the button and the layout
// contract must still hold while focused.
export const Focused: Story = {
	play: async ({ canvasElement }) => {
		const button = canvasElement.querySelector("button");
		if (!button) throw new Error("button not found");
		button.focus();
		await expect(document.activeElement).toBe(button);
		await expect(button.matches(":focus")).toBe(true);
		expectCanvasLayout(canvasElement);
	},
};

// Issue #194: long-string coverage — an over-long label must not push
// page-level horizontal overflow or escape the viewport.
export const LongLabel: Story = {
	args: {
		children:
			"Apply this preset to the selected layers with an extremely long descriptive label that keeps going",
	},
	play: async ({ canvasElement }) => {
		expectCanvasLayout(canvasElement);
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
	play: async ({ canvasElement }) => {
		expectCanvasLayout(canvasElement);
		// Issue #722: bordered non-primary variants rest on the
		// non-assertive `border.subtle` tier — ghost included — while
		// `border.control` stays reserved for identifiable text fields.
		const byText = (label: string): HTMLButtonElement => {
			const el = Array.from(
				canvasElement.querySelectorAll<HTMLButtonElement>("button"),
			).find((b) => b.textContent === label);
			if (!el) throw new Error(`button "${label}" not found`);
			return el;
		};
		for (const label of ["Default", "Secondary", "Ghost", "Danger"]) {
			const color = borderTopColor(byText(label));
			expect(color).toBe(resolveBorderToken("subtle"));
			expect(color).not.toBe(resolveBorderToken("control"));
		}
	},
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

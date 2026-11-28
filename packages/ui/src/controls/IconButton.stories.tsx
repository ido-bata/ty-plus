import type { Meta, StoryObj } from "@storybook/react";
import { Check, MoreHorizontal, Plus } from "lucide-react";
import { expect } from "storybook/test";
import { expectCanvasLayout } from "@/storybook/quality/layout";
import { css } from "@/styled-system/css";

import { IconButton } from "./IconButton";

const meta = {
	title: "Shared/Controls/IconButton",
	component: IconButton,
	argTypes: {
		variant: {
			control: { type: "select" },
			options: ["ghost", "default"],
		},
		size: {
			control: { type: "select" },
			options: ["xs", "sm", "md", "lg"],
		},
		active: { control: "boolean" },
		disabled: { control: "boolean" },
		"aria-label": { control: "text" },
		children: { control: false },
	},
	args: {
		variant: "ghost",
		size: "md",
		disabled: false,
		"aria-label": "Add item",
	},
} satisfies Meta<typeof IconButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	play: ({ canvasElement }) => {
		const icon = canvasElement.querySelector("button svg");
		if (!icon) throw new Error("Button icon did not render");
		const style = getComputedStyle(icon);
		if (style.flexShrink !== "0" || style.pointerEvents !== "none") {
			throw new Error("Button descendant icon styles were not applied");
		}
	},
	render: (args) => (
		<IconButton {...args}>
			<Plus />
		</IconButton>
	),
};

export const Disabled: Story = {
	args: { disabled: true, "aria-label": "Completed" },
	render: (args) => (
		<IconButton {...args}>
			<Check />
		</IconButton>
	),
};

export const VariantsAndSizes: Story = {
	render: (args) => (
		<div className={css({ display: "flex", alignItems: "center", gap: "2" })}>
			<IconButton {...args} variant="ghost" size="sm" aria-label="Small ghost">
				<MoreHorizontal />
			</IconButton>
			<IconButton {...args} variant="ghost" size="md" aria-label="Medium ghost">
				<MoreHorizontal />
			</IconButton>
			<IconButton
				{...args}
				variant="default"
				size="md"
				aria-label="Medium default"
			>
				<MoreHorizontal />
			</IconButton>
			<IconButton
				{...args}
				variant="default"
				size="lg"
				aria-label="Large default"
			>
				<MoreHorizontal />
			</IconButton>
		</div>
	),
	// Issue #798: the story name promises a size range — pin that the
	// rendered control heights actually differ (sm/md/lg tiers), so a
	// capture cannot silently collapse back to one size.
	play: async ({ canvasElement }) => {
		const heights = new Set(
			Array.from(canvasElement.querySelectorAll("button")).map(
				(el) => el.getBoundingClientRect().height,
			),
		);
		expect(heights.size).toBeGreaterThanOrEqual(3);
	},
};

export const Active: Story = {
	args: { active: true, "aria-pressed": true },
	render: (args) => (
		<div className={css({ display: "flex", alignItems: "center", gap: "2" })}>
			<IconButton {...args} aria-label="List view" aria-pressed>
				<Plus />
			</IconButton>
			<IconButton
				{...args}
				active={false}
				aria-label="Grid view"
				aria-pressed={false}
			>
				<Plus />
			</IconButton>
		</div>
	),
	play: async ({ canvasElement }) => {
		const pressed = canvasElement.querySelector<HTMLElement>(
			'button[aria-pressed="true"]',
		);
		const unpressed = canvasElement.querySelector<HTMLElement>(
			'button[aria-pressed="false"]',
		);
		if (!pressed || !unpressed) throw new Error("toggle buttons not found");
		const pressedStyle = getComputedStyle(pressed);
		const unpressedStyle = getComputedStyle(unpressed);
		// The selected surface must differ from the ghost default — it once
		// lost the stylesheet-order cascade and both states rendered
		// pixel-identical (#470).
		expect(pressedStyle.backgroundColor).not.toBe(
			unpressedStyle.backgroundColor,
		);
		expect(pressedStyle.color).not.toBe(unpressedStyle.color);
	},
};

// Issue #166: hover-state capture — a real-pointer hover must lift the
// ghost variant to `interactive.hover` (and brighten the glyph); the
// post-play state is what the capture pipeline screenshots.
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

// Issue #166: keyboard focus must reach the button and paint the shared
// focus ring (`--color-focus-ring` box-shadow under `:focus-visible`).
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

export const AllSizes: Story = {
	render: (args) => (
		<div className={css({ display: "flex", alignItems: "center", gap: "2" })}>
			<IconButton {...args} size="xs" aria-label="Extra small">
				<Plus />
			</IconButton>
			<IconButton {...args} size="sm" aria-label="Small">
				<Plus />
			</IconButton>
			<IconButton {...args} size="md" aria-label="Medium">
				<Plus />
			</IconButton>
			<IconButton {...args} size="lg" aria-label="Large">
				<Plus />
			</IconButton>
		</div>
	),
};

import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { expect } from "storybook/test";
import { expectCanvasLayout } from "@/storybook/quality/layout";
import {
	SegmentedControl,
	type SegmentedControlProps,
} from "./SegmentedControl";

const options = [
	{ value: "all", label: "All" },
	{ value: "active", label: "Active" },
	{ value: "archived", label: "Archived" },
];

function ControlledSegmentedControl(props: SegmentedControlProps) {
	const [value, setValue] = useState(props.value);
	return <SegmentedControl {...props} value={value} onChange={setValue} />;
}

const meta = {
	title: "Shared/Controls/SegmentedControl",
	component: SegmentedControl,
	argTypes: {
		options: { control: "object" },
		value: { control: "text" },
		onChange: { action: "changed" },
		"aria-label": { control: "text" },
		className: { control: "text" },
		buttonClassName: { control: "text" },
		selectedClassName: { control: "text" },
		unselectedClassName: { control: "text" },
	},
	args: {
		options,
		value: "all",
		onChange: () => undefined,
		"aria-label": "Filter items",
	},
} satisfies Meta<typeof SegmentedControl>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	render: (args) => <ControlledSegmentedControl {...args} />,
};

export const ActiveSelected: Story = {
	args: { value: "active" },
	render: (args) => <ControlledSegmentedControl {...args} />,
};

export const CustomLabels: Story = {
	args: {
		options: [
			{ value: "design", label: "Design" },
			{ value: "motion", label: "Motion" },
		],
		value: "motion",
		"aria-label": "Asset type",
	},
	render: (args) => <ControlledSegmentedControl {...args} />,
};

export const CustomColors: Story = {
	args: {
		selectedClassName: "bg-text-primary text-surface-panel",
		unselectedClassName:
			"bg-surface-widget text-text-muted hover:bg-interactive-hover hover:text-text-primary",
	},
	render: (args) => <ControlledSegmentedControl {...args} />,
};

// Issue #166: hover must lift an unselected segment to
// `interactive.hover` — a real-pointer hover is what the capture
// pipeline screenshots.
export const HoveredSegment: Story = {
	render: (args) => <ControlledSegmentedControl {...args} />,
	play: async ({ canvasElement }) => {
		expectCanvasLayout(canvasElement);
		const buttons = Array.from(
			canvasElement.querySelectorAll<HTMLButtonElement>("button"),
		);
		const target = buttons.find((b) => b.textContent === "Archived");
		if (!target) throw new Error("Archived segment not found");
		const { userEvent } = await import("vitest/browser");
		const spacer = document.createElement("div");
		spacer.style.cssText = "position:fixed;top:0;left:0;width:8px;height:8px;";
		document.body.appendChild(spacer);
		await userEvent.hover(spacer);
		await new Promise((resolve) => setTimeout(resolve, 300));
		const resting = getComputedStyle(target).backgroundColor;
		await userEvent.hover(target);
		await expect(target.matches(":hover")).toBe(true);
		await new Promise((resolve) => setTimeout(resolve, 300));
		await expect(getComputedStyle(target).backgroundColor).not.toBe(resting);
		await userEvent.unhover(target);
		spacer.remove();
		expectCanvasLayout(canvasElement);
	},
};

// Issue #166: clicking a segment selects it — `aria-pressed` flips and the
// selected surface replaces the unselected one.
export const SelectedOnClick: Story = {
	render: (args) => <ControlledSegmentedControl {...args} />,
	play: async ({ canvasElement }) => {
		expectCanvasLayout(canvasElement);
		const buttons = Array.from(
			canvasElement.querySelectorAll<HTMLButtonElement>("button"),
		);
		const target = buttons.find((b) => b.textContent === "Active");
		if (!target) throw new Error("Active segment not found");
		const { userEvent } = await import("vitest/browser");
		await expect(target.getAttribute("aria-pressed")).toBe("false");
		const resting = getComputedStyle(target).backgroundColor;
		await userEvent.click(target);
		await expect(target.getAttribute("aria-pressed")).toBe("true");
		await new Promise((resolve) => setTimeout(resolve, 300));
		await expect(getComputedStyle(target).backgroundColor).not.toBe(resting);
		expectCanvasLayout(canvasElement);
	},
};

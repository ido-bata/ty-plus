import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { expect } from "storybook/test";
import { expectCanvasLayout } from "@/storybook/quality/layout";
import { css } from "@/styled-system/css";

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

// Issue #524: class overrides must be real Panda classes — Tailwind-style
// literals generate no CSS in the Panda-only bundle, and because
// `selectedClassName` *replaces* the default active style, dead classes
// left every segment unstyled and identical.
const customSelectedClass = css({
	backgroundColor: "text.primary",
	color: "surface.panel",
});
const customUnselectedClass = css({
	backgroundColor: "surface.panel",
	color: "text.primary",
	_hover: { backgroundColor: "interactive.hover" },
});

export const CustomColors: Story = {
	args: {
		selectedClassName: customSelectedClass,
		unselectedClassName: customUnselectedClass,
	},
	render: (args) => <ControlledSegmentedControl {...args} />,
	play: async ({ canvasElement }) => {
		const buttons = Array.from(
			canvasElement.querySelectorAll<HTMLButtonElement>("button"),
		);
		const selected = buttons.find(
			(b) => b.getAttribute("aria-pressed") === "true",
		);
		const unselected = buttons.find(
			(b) => b.getAttribute("aria-pressed") === "false",
		);
		if (!selected || !unselected) throw new Error("segments not found");
		expect(getComputedStyle(selected).backgroundColor).not.toBe(
			getComputedStyle(unselected).backgroundColor,
		);
	},
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
		// Keep the hover state: the screenshot is captured after play ends,
		// so unhovering here would leave only the resting state on film.
		spacer.remove();
		await expect(target.matches(":hover")).toBe(true);
		expectCanvasLayout(canvasElement);
	},
};

// Issue #723: the strip must stay on a single row at every width. When
// full labels no longer fit, options with `compactLabel` swap to their
// short form; the accessible name remains the full label.
const adaptiveOptions = [
	{ value: "curve", label: "Comfortable curve", compactLabel: "Cv" },
	{ value: "bounce", label: "Springy bounce", compactLabel: "Bo" },
	{ value: "elastic", label: "Wobbly elastic", compactLabel: "El" },
];

const settleLabels = () => new Promise((resolve) => setTimeout(resolve, 80));

const singleRowTops = (toolbar: Element): number =>
	new Set(
		Array.from(toolbar.querySelectorAll("button")).map((button) =>
			Math.round(button.getBoundingClientRect().top),
		),
	).size;

export const AdaptiveLabels: Story = {
	args: {
		options: adaptiveOptions,
		"aria-label": "Easing mode",
	},
	render: (args) => (
		<div className={css({ display: "flex", gap: "4", padding: "4" })}>
			<div style={{ width: 380 }}>
				<ControlledSegmentedControl {...args} />
			</div>
			<div style={{ width: 120 }}>
				<ControlledSegmentedControl {...args} value="bounce" />
			</div>
		</div>
	),
	play: async ({ canvasElement }) => {
		expectCanvasLayout(canvasElement);
		await settleLabels();
		const toolbars = Array.from(
			canvasElement.querySelectorAll<HTMLElement>('[role="toolbar"]'),
		);
		expect(toolbars).toHaveLength(2);
		const [wide, narrow] = toolbars;
		if (!wide || !narrow) throw new Error("expected two strips");

		// Wide strip keeps the full labels; narrow strip switches to the
		// compact forms — the label *content* adapts, it is not truncated.
		expect(wide.textContent).toContain("Comfortable curve");
		expect(narrow.textContent).toContain("Cv");
		expect(narrow.textContent).not.toContain("Comfortable curve");

		// Both strips stay on a single row and nothing is clipped inside
		// a segment.
		for (const toolbar of toolbars) {
			expect(singleRowTops(toolbar)).toBe(1);
			for (const button of toolbar.querySelectorAll("button")) {
				expect(button.scrollWidth).toBeLessThanOrEqual(button.clientWidth + 1);
			}
		}
		expectCanvasLayout(canvasElement);
	},
};

// Issue #723: when even compact labels cannot fit — or none are provided —
// the strip scrolls horizontally instead of wrapping to a second row.
export const OverflowScrollsHorizontally: Story = {
	args: {
		options: Array.from({ length: 11 }, (_, index) => ({
			value: `source-${index}`,
			label: `Source filter number ${index}`,
		})),
		"aria-label": "Filter by source",
	},
	render: (args) => (
		<div style={{ width: 220, padding: 8 }}>
			<ControlledSegmentedControl {...args} />
		</div>
	),
	play: async ({ canvasElement }) => {
		expectCanvasLayout(canvasElement);
		await settleLabels();
		const toolbar =
			canvasElement.querySelector<HTMLElement>('[role="toolbar"]');
		if (!toolbar) throw new Error("strip not found");
		expect(toolbar.querySelectorAll("button")).toHaveLength(11);
		// Single row, and the excess width is reachable by scrolling —
		// no segment is dropped to a second line or clipped.
		expect(singleRowTops(toolbar)).toBe(1);
		expect(getComputedStyle(toolbar).overflowX).toBe("auto");
		expect(toolbar.scrollWidth).toBeGreaterThan(toolbar.clientWidth);
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

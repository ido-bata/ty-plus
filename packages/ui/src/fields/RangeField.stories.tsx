import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { expect } from "storybook/test";
import { css } from "@/styled-system/css";
import { RangeField } from "./RangeField";

const meta = {
	title: "Shared/Fields/RangeField",
	component: RangeField,
	argTypes: {
		label: { control: "text" },
		value: { control: "number" },
		min: { control: "number" },
		max: { control: "number" },
		step: { control: "number" },
		unit: { control: "text" },
		className: { control: "text" },
		onChange: { action: "changed" },
	},
	args: {
		label: "Volume",
		value: 30,
		min: 0,
		max: 100,
		step: 1,
		unit: "%",
		onChange: () => {},
	},
} satisfies Meta<typeof RangeField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	args: {},
	// Issue #679: the label names the control only — the value must not be
	// duplicated into it; the paired numeric input is the single readout.
	play: async ({ canvasElement }) => {
		const labels = [...canvasElement.querySelectorAll("div")].filter(
			(el) => el.textContent === "Volume",
		);
		await expect(labels.length).toBe(1);
		const unit = canvasElement.querySelector("[data-number-field-unit]");
		await expect(unit?.textContent).toBe("%");
	},
};

export const FineStep: Story = {
	args: {
		label: "Rotation",
		value: 45,
		min: 0,
		max: 360,
		step: 0.5,
		unit: "°",
	},
};

// Issue #679: without a label the readout must still carry its meaning —
// the unit suffix stays visible and both controls get descriptive
// aria-labels.
export const NoLabel: Story = {
	args: {
		label: undefined,
		unit: "%",
	},
	play: async ({ canvasElement }) => {
		const range = canvasElement.querySelector<HTMLInputElement>(
			'input[type="range"]',
		);
		const number = canvasElement.querySelector<HTMLInputElement>(
			'input[type="number"]',
		);
		await expect(range?.getAttribute("aria-label")).toBe("Range");
		await expect(range?.getAttribute("aria-valuetext")).toBe("30%");
		await expect(number?.getAttribute("aria-label")).toBe("Range value %");
		const unit = canvasElement.querySelector("[data-number-field-unit]");
		await expect(unit?.textContent).toBe("%");
	},
};

export const Interactive: Story = {
	render: () => {
		const [value, setValue] = useState(60);
		return (
			<div style={{ width: 280 }}>
				<RangeField
					label="Opacity"
					value={value}
					onChange={setValue}
					min={0}
					max={100}
					step={1}
					unit="%"
				/>
			</div>
		);
	},
	args: {},
};

// Issue #448: extreme values must not be clipped inside the paired numeric
// input — the field used to fix the wrapper at 56px, cutting off digits.
// Issue #736: stacked fields need a real layout gap — a bare block container
// collapses the space between the first control and the next label to the
// label's own line-box leading (~3px), tighter than the internal
// label-to-control gap.
const stackedFields = css({
	display: "flex",
	width: "320px",
	flexDirection: "column",
	gap: "3",
});

export const ExtremeValues: Story = {
	render: () => (
		<div className={stackedFields}>
			<RangeField
				label="Scale"
				value={-2000}
				onChange={() => {}}
				min={-5000}
				max={5000}
			/>
			<RangeField
				label="Scale"
				value={1234.5}
				onChange={() => {}}
				min={0}
				max={5000}
				step={0.5}
			/>
		</div>
	),
	args: {},
	play: async ({ canvasElement }) => {
		const inputs = canvasElement.querySelectorAll<HTMLInputElement>(
			'input[type="number"]',
		);
		await expect(inputs.length).toBe(2);
		for (const input of inputs) {
			// scrollWidth > clientWidth means the text is clipped horizontally.
			await expect(input.scrollWidth).toBeLessThanOrEqual(
				input.clientWidth + 1,
			);
		}
		// The gap from the first field's control to the second field's label
		// must not be tighter than that field's own label-to-control gap.
		const labels = [...canvasElement.querySelectorAll("div")].filter(
			(el) => el.children.length === 0 && el.textContent === "Scale",
		);
		const secondLabel = labels[1];
		const row = secondLabel?.nextElementSibling;
		if (!secondLabel || !row) throw new Error("stacked labels not found");
		const stackedGap =
			secondLabel.getBoundingClientRect().top -
			inputs[0].getBoundingClientRect().bottom;
		const internalGap =
			row.getBoundingClientRect().top -
			secondLabel.getBoundingClientRect().bottom;
		await expect(stackedGap).toBeGreaterThanOrEqual(internalGap - 1);
	},
};

// Issue #736: keyboard focus must paint the shared `--color-focus-ring`
// instead of WebKit's native blue outline on the range input.
export const Focused: Story = {
	args: {},
	play: async ({ canvasElement }) => {
		const range = canvasElement.querySelector<HTMLInputElement>(
			'input[type="range"]',
		);
		if (!range) throw new Error("range input not found");
		range.focus();
		await expect(document.activeElement).toBe(range);
		await new Promise((resolve) => setTimeout(resolve, 300));
		const style = getComputedStyle(range);
		await expect(style.boxShadow).not.toBe("none");
		await expect(style.outlineStyle).toBe("none");
	},
};

// Issue #166: keyboard interaction — arrow keys on the focused range input
// must commit a new value through `onChange` (drives both the slider and
// the paired numeric field from one state source).
export const KeyboardAdjust: Story = {
	render: () => {
		const [value, setValue] = useState(60);
		return (
			<div style={{ width: 280 }}>
				<RangeField
					label="Opacity"
					value={value}
					onChange={setValue}
					min={0}
					max={100}
					step={1}
					unit="%"
				/>
			</div>
		);
	},
	args: {},
	play: async ({ canvasElement }) => {
		const range = canvasElement.querySelector<HTMLInputElement>(
			'input[type="range"]',
		);
		if (!range) throw new Error("range input not found");
		const { userEvent } = await import("vitest/browser");
		range.focus();
		await expect(document.activeElement).toBe(range);
		const before = Number(range.value);
		await userEvent.keyboard("{ArrowRight}");
		await new Promise((resolve) => setTimeout(resolve, 300));
		await expect(Number(range.value)).toBe(before + 1);
	},
};

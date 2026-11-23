import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { expect } from "storybook/test";
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

export const NoLabel: Story = {
	args: {
		label: undefined,
		unit: undefined,
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
export const ExtremeValues: Story = {
	render: () => (
		<div style={{ width: 320 }}>
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

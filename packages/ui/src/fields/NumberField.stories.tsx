import type { Decorator, Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { expect } from "storybook/test";
import { borderTopColor, resolveBorderToken } from "@/storybook/quality/border";
import { NumberField } from "./NumberField";

// Issue #798: `width: "full"` is the form-row contract, but the bare
// canvas stretched the field ~1260px while `Interactive` sat in a 240px
// column — captures read as different components. Same field-column
// fixture as ListSelect/RangeField (#768).
const fieldColumn: Decorator = (Story) => (
	<div style={{ width: 280 }}>
		<Story />
	</div>
);

const meta = {
	title: "Shared/Fields/NumberField",
	component: NumberField,
	decorators: [fieldColumn],
	argTypes: {
		label: { control: "text" },
		value: { control: "number" },
		min: { control: "number" },
		max: { control: "number" },
		step: { control: "number" },
		unit: { control: "text" },
		description: { control: "text" },
		uiSize: { control: "select", options: ["sm", "md", "lg"] },
		disabled: { control: "boolean" },
		numberSpinners: { control: "boolean" },
		onChange: { action: "changed" },
	},
	args: {
		label: "Scale",
		value: 50,
		min: 0,
		max: 100,
		step: 1,
		unit: "%",
		description: "Resize the layer uniformly.",
		uiSize: "md",
		onChange: () => {},
	},
} satisfies Meta<typeof NumberField>;

export default meta;
type Story = StoryObj<typeof meta>;

// #551: the unit must sit on the same row as the input (right-hand
// suffix), not wrap to a helper line underneath it.
const playUnitBesideInput = async ({
	canvasElement,
}: {
	canvasElement: HTMLElement;
}): Promise<void> => {
	const input = canvasElement.querySelector<HTMLInputElement>("input");
	const unit = canvasElement.querySelector<HTMLElement>(
		"[data-number-field-unit]",
	);
	if (!input || !unit) throw new Error("number field unit row not found");
	const inputRect = input.getBoundingClientRect();
	const unitRect = unit.getBoundingClientRect();
	expect(unitRect.left).toBeGreaterThanOrEqual(inputRect.right - 1);
	const inputCenter = inputRect.top + inputRect.height / 2;
	const unitCenter = unitRect.top + unitRect.height / 2;
	expect(Math.abs(unitCenter - inputCenter)).toBeLessThan(4);
};

export const Default: Story = {
	args: {},
	play: playUnitBesideInput,
};

export const WithBoundedRange: Story = {
	args: {
		label: "Opacity",
		value: 75,
		min: 0,
		max: 255,
		step: 1,
		unit: "px",
		description: undefined,
	},
};

export const Disabled: Story = {
	args: {
		disabled: true,
	},
	play: async ({ canvasElement }) => {
		const input = canvasElement.querySelector<HTMLInputElement>("input");
		if (!input) throw new Error("number input not found");
		// Issue #798: disabled text-entry chrome drops to the passive
		// `border.subtle` tier (the #768 contract) — `border.control` at
		// the 0.5 dim still read as an enabled field.
		expect(borderTopColor(input)).toBe(resolveBorderToken("subtle"));
		expect(borderTopColor(input)).not.toBe(resolveBorderToken("control"));
	},
};

export const Interactive: Story = {
	render: () => {
		const [value, setValue] = useState("12");
		return (
			<div style={{ width: 240 }}>
				<NumberField
					label="Frames"
					value={value}
					onChange={setValue}
					min={1}
					max={120}
					step={1}
					unit="frames"
				/>
			</div>
		);
	},
	args: {},
};

// Issue #166: focus state — the inner Input repaints its border to
// `interactive.focus` on `:focus` (and reveals the WebKit spinners).
export const Focused: Story = {
	args: {},
	play: async ({ canvasElement }) => {
		const input = canvasElement.querySelector<HTMLInputElement>("input");
		if (!input) throw new Error("number input not found");
		const restingBorderColor = getComputedStyle(input).borderTopColor;
		input.focus();
		await expect(document.activeElement).toBe(input);
		await expect(input.matches(":focus")).toBe(true);
		await new Promise((resolve) => setTimeout(resolve, 300));
		await expect(getComputedStyle(input).borderTopColor).not.toBe(
			restingBorderColor,
		);
	},
};

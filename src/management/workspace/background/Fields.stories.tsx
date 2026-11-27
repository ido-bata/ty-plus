import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "storybook/test";
import { css } from "@/styled-system/css";

import { ColorField, FieldLabel, NumberField } from "./Fields";

type Args = {
	value: number;
	min: number;
	max: number;
	color: string;
	noLabel: boolean;
};

const noopNumber = (): void => undefined;
const noopColor = (): void => undefined;

const baseArgs: Args = {
	value: 60,
	min: 0,
	max: 100,
	color: "#4facfe",
	noLabel: false,
};

const meta = {
	title: "Background/Fields",
	args: baseArgs,
	argTypes: {
		value: { control: { type: "number", min: 0, max: 100 } },
		min: { control: { type: "number" } },
		max: { control: { type: "number" } },
		color: { control: "color" },
		noLabel: { control: "boolean" },
	},
	render: (args: Args) => (
		<div
			className={css({
				display: "flex",
				width: "360px",
				flexDirection: "column",
				gap: "3",
				p: "3",
			})}
		>
			<NumberField
				label={args.noLabel ? "" : "Opacity"}
				value={args.value}
				min={args.min}
				max={args.max}
				onValueChange={noopNumber}
			/>
			<ColorField
				label={args.noLabel ? "" : "Color"}
				value={args.color}
				onColorChange={noopColor}
			/>
			<div className={css({ display: "flex", alignItems: "center", gap: "2" })}>
				<FieldLabel>Field label only</FieldLabel>
			</div>
		</div>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {
	play: async ({ canvasElement }) => {
		// Hex colours render a plain swatch — no transparent badge.
		expect(
			canvasElement.querySelector(
				'[data-testid="color-field-transparent-badge"]',
			),
		).toBeNull();
	},
};

export const NoLabels: Story = {
	args: { noLabel: true },
};

export const TransparentColor: Story = {
	args: { color: "transparent" },
	play: async ({ canvasElement }) => {
		// Issue #748: `"transparent"` cannot be shown by `<input type="color">`,
		// so the field must paint the checkerboard badge instead of an
		// opaque fallback chip.
		expect(
			canvasElement.querySelector(
				'[data-testid="color-field-transparent-badge"]',
			),
		).not.toBeNull();
	},
};

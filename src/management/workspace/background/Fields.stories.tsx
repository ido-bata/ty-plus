import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "storybook/test";
import { borderTopColor, resolveBorderToken } from "@/storybook/quality/border";
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
			{/* Issue #768: the bare-label demo only makes sense alongside
			 * labelled fields — in the no-labels story it rendered as an
			 * orphaned "FIELD LABEL ONLY" caption. */}
			{args.noLabel ? null : (
				<div
					className={css({
						display: "flex",
						alignItems: "center",
						gap: "2",
					})}
				>
					<FieldLabel>Field label only</FieldLabel>
				</div>
			)}
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
		// Issue #768: sibling field labels must share one typographic
		// treatment — "Opacity" (RangeField) and "Color" (ColorField) used
		// to disagree (sentence-case primary vs uppercase muted).
		const labelByText = (text: string): Element | undefined =>
			Array.from(canvasElement.querySelectorAll("*")).find(
				(el) => el.children.length === 0 && el.textContent?.trim() === text,
			);
		const opacityLabel = labelByText("Opacity");
		const colorLabel = labelByText("Color");
		if (!opacityLabel || !colorLabel) {
			throw new Error("field labels not found");
		}
		const a = getComputedStyle(opacityLabel);
		const b = getComputedStyle(colorLabel);
		expect(b.textTransform).toBe(a.textTransform);
		expect(b.color).toBe(a.color);
		// Issue #795: the hex text input and the numeric readout are sibling
		// identifiable controls — both must rest on the `border.control`
		// tier. The hex input used to be forced onto the invisible
		// `--color-ty-widget-border` and read as static text.
		const inputs = Array.from(
			canvasElement.querySelectorAll<HTMLInputElement>("input"),
		);
		const hexInput = inputs.find(
			(el) => el.type === "text" && el.value.startsWith("#"),
		);
		const numberInput = inputs.find((el) => el.type === "number");
		if (!hexInput || !numberInput) {
			throw new Error("hex/number inputs not found");
		}
		expect(borderTopColor(hexInput)).toBe(resolveBorderToken("control"));
		expect(borderTopColor(numberInput)).toBe(resolveBorderToken("control"));
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
		const badge = canvasElement.querySelector<HTMLElement>(
			'[data-testid="color-field-transparent-badge"]',
		);
		expect(badge).not.toBeNull();
		// Issue #768: the checkerboard badge overlays the swatch edge-to-edge
		// and must carry the same perimeter border — otherwise the pattern
		// bleeds into the canvas with no bounding stroke.
		if (!badge) throw new Error("transparent badge not found");
		const badgeBorder = getComputedStyle(badge).borderTopWidth;
		expect(badgeBorder).not.toBe("0px");
	},
};

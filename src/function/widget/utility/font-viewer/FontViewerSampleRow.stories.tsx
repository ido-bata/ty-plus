import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "storybook/test";
import { borderTopColor, resolveBorderToken } from "@/storybook/quality/border";
import { measureBox } from "@/storybook/quality/layout";
import { FontViewerSampleRow } from "./FontViewerSampleRow";
import { FONT_SAMPLE_PRESETS } from "./sample-presets";

type Args = {
	presetChoice: string;
	sample: string;
	custom: boolean;
};

const noop = (): void => undefined;

const baseArgs: Args = {
	presetChoice: "latin",
	sample: "The quick brown fox jumps over the lazy dog.",
	custom: false,
};

/*
 * Issue #754 regression contract:
 *  - the ListSelect trigger must sit on the same flex row as the sample
 *    Input (its old `width: full` root claimed the whole line and wrapped
 *    the Input to a second row),
 *  - the trigger is an identifiable control, so its resting border is the
 *    `border.control` tier shared with Input — not `border.subtle`.
 */
const expectSampleRowLayout = ({
	canvasElement,
}: {
	canvasElement: HTMLElement;
}): void => {
	const trigger = canvasElement.querySelector<HTMLButtonElement>(
		'button[aria-haspopup="listbox"]',
	);
	const selectRoot = trigger?.parentElement;
	const input = canvasElement.querySelector<HTMLInputElement>("input");
	if (!trigger || !selectRoot || !input) {
		throw new Error("sample row controls not found");
	}
	expect(borderTopColor(trigger)).toBe(resolveBorderToken("control"));
	const selectBox = measureBox(selectRoot);
	const inputBox = measureBox(input);
	// Same row: the Input's top edge starts before the select's bottom edge
	// (a wrapped Input would begin a full row + gap below it).
	expect(inputBox.y).toBeLessThanOrEqual(selectBox.y + selectBox.height + 1);
	// Issue #797: the two controls share one vertical centerline — the
	// ListSelect `sm` trigger is taller than the `sm` Input, so bottom or
	// top alignment leaves one control visibly off-keyline.
	const selectCenter = selectBox.y + selectBox.height / 2;
	const inputCenter = inputBox.y + inputBox.height / 2;
	expect(Math.abs(selectCenter - inputCenter)).toBeLessThanOrEqual(1);
	// The picker shrink-wraps its label — it must not claim the row width.
	const row = selectRoot.parentElement;
	if (row) {
		expect(selectBox.width).toBeLessThan(measureBox(row).width);
	}
};

const meta = {
	title: "FontViewer/SampleRow",
	args: baseArgs,
	argTypes: {
		presetChoice: {
			control: { type: "inline-radio" },
			options: FONT_SAMPLE_PRESETS.map((p) => p.id).concat("custom"),
		},
		sample: { control: "text" },
		custom: { control: "boolean" },
	},
	decorators: [
		(Story) => (
			<div style={{ width: 360, padding: 12 }}>
				<Story />
			</div>
		),
	],
	render: (args: Args) => (
		<FontViewerSampleRow
			presets={FONT_SAMPLE_PRESETS}
			presetChoice={args.custom ? "custom" : args.presetChoice}
			sample={args.sample}
			onSampleChange={noop}
			onPresetChoiceChange={noop}
		/>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {
	play: expectSampleRowLayout,
};

export const Cjk: Story = {
	args: {
		presetChoice: "cjk",
		sample: "天地玄黃宇宙洪荒 日月盈昃辰宿列張",
	},
	play: expectSampleRowLayout,
};

export const Custom: Story = {
	args: {
		custom: true,
		sample: "Custom preview text 1234",
	},
	play: expectSampleRowLayout,
};

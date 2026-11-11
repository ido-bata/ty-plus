import type { Meta, StoryObj } from "@storybook/react";
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

export const Default: Story = {};

export const Cjk: Story = {
	args: {
		presetChoice: "cjk",
		sample: "天地玄黃宇宙洪荒 日月盈昃辰宿列張",
	},
};

export const Custom: Story = {
	args: {
		custom: true,
		sample: "Custom preview text 1234",
	},
};

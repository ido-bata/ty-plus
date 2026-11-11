import type { Meta, StoryObj } from "@storybook/react";
import type { Layer } from "@/management/workspace/background/contract";
import { PatternLayerEditor } from "@/management/workspace/background/PatternLayerEditor";
import { css } from "@/styled-system/css";

type Args = {
	patternType: "dots" | "grid" | "lines";
	patternSize: number;
	patternColor: string;
	patternBgColor: string;
	opacity: number;
};

const noop = (): void => undefined;
const stubT = (key: string, options?: Record<string, unknown>): string => {
	if (
		options &&
		"defaultValue" in options &&
		typeof options.defaultValue === "string"
	) {
		return options.defaultValue as string;
	}
	return key;
};

const baseArgs: Args = {
	patternType: "dots",
	patternSize: 6,
	patternColor: "#444444",
	patternBgColor: "transparent",
	opacity: 100,
};

const buildLayer = (args: Args): Layer => ({
	id: "layer-pattern-1",
	type: "pattern",
	enabled: true,
	opacity: args.opacity,
	patternType: args.patternType,
	patternSize: args.patternSize,
	patternColor: args.patternColor,
	patternColorOpacity: args.opacity,
	patternBgColor: args.patternBgColor,
	patternBgOpacity: args.opacity,
});

const meta = {
	title: "Background/PatternLayerEditor",
	args: baseArgs,
	argTypes: {
		patternType: {
			control: { type: "inline-radio" },
			options: ["dots", "grid", "lines"],
		},
		patternSize: { control: { type: "number", min: 2, max: 64 } },
		patternColor: { control: "color" },
		patternBgColor: { control: "color" },
		opacity: { control: { type: "number", min: 0, max: 100 } },
	},
	render: (args: Args) => (
		<div className={css({ width: "320px", p: "3" })}>
			<PatternLayerEditor
				layer={buildLayer(args)}
				updateLayer={noop}
				t={stubT}
			/>
		</div>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const Grid: Story = {
	args: { patternType: "grid" },
};

export const LowOpacity: Story = {
	args: { opacity: 30 },
};

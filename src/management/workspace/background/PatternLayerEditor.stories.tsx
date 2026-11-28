import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "storybook/test";
import type { Layer } from "@/management/workspace/background/contract";
import { PatternLayerEditor } from "@/management/workspace/background/PatternLayerEditor";
import { storyT } from "@/storybook/i18n-story-t";
import { css } from "@/styled-system/css";

type Args = {
	patternType: "dots" | "grid" | "lines";
	patternSize: number;
	patternColor: string;
	patternBgColor: string;
	opacity: number;
};

const noop = (): void => undefined;

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
				t={storyT("dialogs")}
			/>
		</div>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {
	play: async ({ canvasElement }) => {
		// Issue #795: `patternBgColor: "transparent"` consumes no opacity —
		// its RangeField (slider + numeric readout) must render disabled
		// while the foreground pair (hex colour) stays enabled. DOM order:
		// patternSize, foreground opacity, background opacity.
		const sliders = canvasElement.querySelectorAll<HTMLInputElement>(
			'input[type="range"]',
		);
		expect(sliders).toHaveLength(3);
		expect(sliders[0]?.disabled).toBe(false);
		expect(sliders[1]?.disabled).toBe(false);
		expect(sliders[2]?.disabled).toBe(true);
		const readouts = canvasElement.querySelectorAll<HTMLInputElement>(
			'input[type="number"]',
		);
		expect(readouts).toHaveLength(3);
		expect(readouts[2]?.disabled).toBe(true);
	},
};

export const Grid: Story = {
	args: { patternType: "grid" },
};

export const LowOpacity: Story = {
	args: { opacity: 30 },
};

import type { Meta, StoryObj } from "@storybook/react";
import type { Layer } from "@/management/workspace/background/contract";
import { ImageLayerEditor } from "@/management/workspace/background/ImageLayerEditor";
import { css } from "@/styled-system/css";

type Args = {
	imageFit: "cover" | "contain" | "stretch" | "auto";
	imageRepeat: "no-repeat" | "repeat" | "repeat-x" | "repeat-y";
	imagePath: string;
	imageScale: number;
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
	imageFit: "cover",
	imageRepeat: "no-repeat",
	imagePath: "/sample/preset/bg.png",
	imageScale: 100,
};

const buildLayer = (args: Args): Layer => ({
	id: "layer-image-1",
	type: "image",
	enabled: true,
	opacity: 100,
	imagePath: args.imagePath,
	imageSource: "file",
	imageFit: args.imageFit,
	imageRepeat: args.imageRepeat,
	imageScale: args.imageScale,
	imageShiftX: 0,
	imageShiftY: 0,
});

const meta = {
	title: "Background/ImageLayerEditor",
	args: baseArgs,
	argTypes: {
		imageFit: {
			control: { type: "inline-radio" },
			options: ["cover", "contain", "stretch", "auto"],
		},
		imageRepeat: {
			control: { type: "inline-radio" },
			options: ["no-repeat", "repeat", "repeat-x", "repeat-y"],
		},
		imagePath: { control: "text" },
		imageScale: { control: { type: "number", min: 10, max: 500 } },
	},
	render: (args: Args) => (
		<div className={css({ width: "320px", p: "3" })}>
			<ImageLayerEditor layer={buildLayer(args)} updateLayer={noop} t={stubT} />
		</div>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const AutoFit: Story = {
	args: { imageFit: "auto", imageScale: 150 },
};

export const Repeated: Story = {
	args: { imageRepeat: "repeat", imageFit: "stretch" },
};

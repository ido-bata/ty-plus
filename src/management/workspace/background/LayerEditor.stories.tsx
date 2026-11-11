import type { Meta, StoryObj } from "@storybook/react";
import type { Layer } from "@/management/workspace/background/contract";
import {
	LayerEditor,
	LayerIcon,
} from "@/management/workspace/background/LayerEditor";
import { css } from "@/styled-system/css";

type Args = {
	layerType: "color" | "pattern" | "image";
	opacity: number;
	enabled: boolean;
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

const buildLayer = (args: Args): Layer => {
	if (args.layerType === "color") {
		return {
			id: "layer-color",
			type: "color",
			enabled: args.enabled,
			opacity: args.opacity,
			color: "#4facfe",
		};
	}
	if (args.layerType === "pattern") {
		return {
			id: "layer-pattern",
			type: "pattern",
			enabled: args.enabled,
			opacity: args.opacity,
			patternType: "dots",
			patternColor: "#888888",
			patternBgColor: "transparent",
			patternSize: 6,
		};
	}
	return {
		id: "layer-image",
		type: "image",
		enabled: args.enabled,
		opacity: args.opacity,
		imagePath: "/sample/preset/bg.png",
		imageFit: "cover",
		imageRepeat: "no-repeat",
	};
};

const baseArgs: Args = {
	layerType: "color",
	opacity: 80,
	enabled: true,
};

const meta = {
	title: "Background/LayerEditor",
	args: baseArgs,
	argTypes: {
		layerType: {
			control: { type: "inline-radio" },
			options: ["color", "pattern", "image"],
		},
		opacity: { control: { type: "number", min: 0, max: 100 } },
		enabled: { control: "boolean" },
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
			<div
				className={css({
					display: "flex",
					alignItems: "center",
					gap: "2",
					borderRadius: "shell-sm",
					borderWidth: "1px",
					borderStyle: "solid",
					borderColor: "border.default",
					bg: "surface.widget",
					p: "2",
					fontSize: "text-xs",
					color: "text.muted",
				})}
			>
				<LayerIcon layer={buildLayer(args)} />
				<span>Layer icon preview</span>
			</div>
			<LayerEditor layer={buildLayer(args)} updateLayer={noop} t={stubT} />
		</div>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Color: Story = {};

export const Pattern: Story = {
	args: { layerType: "pattern" },
};

export const Image: Story = {
	args: { layerType: "image" },
};

export const Disabled: Story = {
	args: { enabled: false, opacity: 30 },
};

import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "storybook/test";
import type { Layer } from "@/management/workspace/background/contract";
import {
	LayerEditor,
	LayerIcon,
} from "@/management/workspace/background/LayerEditor";
import { storyT } from "@/storybook/i18n-story-t";
import { css } from "@/styled-system/css";

type Args = {
	layerType: "color" | "pattern" | "image";
	opacity: number;
	enabled: boolean;
};

const noop = (): void => undefined;

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
					borderWidth: "hairline",
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
			<LayerEditor
				layer={buildLayer(args)}
				updateLayer={noop}
				t={storyT("dialogs")}
			/>
		</div>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Color: Story = {
	play: async ({ canvasElement }) => {
		// Issue #748: preset swatches must stay square — the Button's fixed
		// size height used to stretch them into wide rectangles.
		const swatches =
			canvasElement.querySelectorAll<HTMLButtonElement>('button[title^="#"]');
		expect(swatches.length).toBeGreaterThan(0);
		for (const swatch of swatches) {
			expect(
				Math.abs(swatch.offsetWidth - swatch.offsetHeight),
			).toBeLessThanOrEqual(1);
		}
		// Issue #795: the capped 3rem preset tracks used to leave a dead
		// strip on the right — `justify-content: space-between` now lands
		// the last swatch flush with the hex field's right edge.
		const hexInput = Array.from(
			canvasElement.querySelectorAll<HTMLInputElement>("input"),
		).find((el) => el.type === "text" && el.value.startsWith("#"));
		const lastSwatch = swatches[swatches.length - 1];
		if (!hexInput || !lastSwatch) {
			throw new Error("hex input or preset swatches not found");
		}
		expect(
			Math.abs(
				lastSwatch.getBoundingClientRect().right -
					hexInput.getBoundingClientRect().right,
			),
		).toBeLessThanOrEqual(2);
	},
};

export const Pattern: Story = {
	args: { layerType: "pattern" },
};

export const Image: Story = {
	args: { layerType: "image" },
};

export const Disabled: Story = {
	args: { enabled: false, opacity: 30 },
	play: async ({ canvasElement }) => {
		// Issue #768: a disabled layer must read as disabled — the editor
		// column dims like the shared controls' disabled treatment
		// (opacity 0.5) instead of rendering at full brightness.
		const editor = canvasElement.querySelector<HTMLElement>(
			"[data-layer-editor]",
		);
		if (!editor) throw new Error("layer editor not found");
		expect(editor.dataset.layerEnabled).toBe("false");
		expect(getComputedStyle(editor).opacity).toBe("0.5");
	},
};

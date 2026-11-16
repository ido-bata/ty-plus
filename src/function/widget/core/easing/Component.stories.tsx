import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "storybook/test";

import { EasingWidget } from "@/function/widget/core/easing/Component";
import type { Layout } from "@/management/workspace/layout/grid-document";
import { css } from "@/styled-system/css";

const layout: Layout = {
	id: "easing-storybook-1",
	widgetType: "easing",
	x: 0,
	y: 0,
	width: 4,
	height: 5,
};

type Args = {
	widthPx: number;
	heightPx: number;
};

const baseArgs: Args = {
	widthPx: 240,
	heightPx: 240,
};

const meta = {
	title: "WidgetCore/Easing",
	args: baseArgs,
	argTypes: {
		widthPx: { control: { type: "number", min: 160, max: 480 } },
		heightPx: { control: { type: "number", min: 160, max: 480 } },
	},
	render: (args: Args) => (
		<div
			className={css({ padding: "3" })}
			style={{ width: args.widthPx, height: args.heightPx }}
		>
			<EasingWidget layout={layout} />
		</div>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const Compact: Story = {
	args: { widthPx: 180, heightPx: 220 },
};

// Loop mode renders the curve editor (the points array is the single-
// cycle template) plus the cycle-count input. We force the mode into
// "loop" via the segmented control's aria-label + data attribute pair
// so the loop controls row becomes visible in Storybook without needing
// a runtime click sequence.
export const LoopMode: Story = {
	args: { widthPx: 280, heightPx: 280 },
	play: async ({ canvasElement }) => {
		const buttons = canvasElement.querySelectorAll<HTMLButtonElement>(
			"[role='toolbar'] button",
		);
		for (const button of buttons) {
			if (button.textContent?.trim() === "Loop") {
				button.click();
				break;
			}
		}
	},
};

// Some CEP/CEF input paths emit mousedown/mousemove/mouseup without the
// matching pointerdown/pointerup — only pointermove is synthesized. This
// story replays a drag using MouseEvent alone (no PointerEvent) to prove
// the canvas still pans/drags through the mouse fallback handlers.
export const MouseOnlyDrag: Story = {
	args: { widthPx: 240, heightPx: 240 },
	play: async ({ canvasElement }) => {
		const canvas = canvasElement.querySelector<HTMLCanvasElement>(
			"[data-ws-easing-editor-canvas]",
		);
		if (!canvas) throw new Error("easing canvas not found");
		const before = canvas.toDataURL();
		const rect = canvas.getBoundingClientRect();
		const fire = (type: string, dx: number, dy: number) => {
			canvas.dispatchEvent(
				new MouseEvent(type, {
					bubbles: true,
					cancelable: true,
					button: 0,
					buttons: type === "mouseup" ? 0 : 1,
					clientX: rect.left + rect.width * 0.5 + dx,
					clientY: rect.top + rect.height * 0.5 + dy,
				}),
			);
		};
		// Center of the canvas is empty space in the default linear curve,
		// so this gesture exercises the pan path.
		fire("mousedown", 0, 0);
		fire("mousemove", 20, 20);
		fire("mousemove", 45, 45);
		fire("mouseup", 45, 45);
		await new Promise((resolve) => setTimeout(resolve, 300));
		await expect(canvas.toDataURL()).not.toBe(before);
	},
};

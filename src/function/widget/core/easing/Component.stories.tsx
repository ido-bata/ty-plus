import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "storybook/test";

import { EasingWidget } from "@/function/widget/core/easing/Component";
import type { Layout } from "@/management/workspace/layout/grid-document";
import {
	boxWithin,
	expectCanvasLayout,
	measureBox,
} from "@/storybook/quality/layout";
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

export const Default: Story = {
	// Issue #194: initial-state layout contract.
	play: async ({ canvasElement }) => {
		expectCanvasLayout(canvasElement);
	},
};

export const Compact: Story = {
	args: { widthPx: 180, heightPx: 220 },
	play: async ({ canvasElement }) => {
		// Issue #473: at compact widths the mode strip wraps onto a second
		// row. A fixed-height strip used to clip that row (Bounce truncated,
		// Elastic hidden) — every segment must stay inside the toolbar box.
		const toolbar =
			canvasElement.querySelector<HTMLElement>("[role='toolbar']");
		if (!toolbar) throw new Error("mode toolbar not found");
		const buttons = toolbar.querySelectorAll("button");
		expect(buttons.length).toBe(4);
		const toolbarBox = measureBox(toolbar);
		for (const button of buttons) {
			expect(boxWithin(measureBox(button), toolbarBox, 1)).toBe(true);
		}
		// The preset "+" button must remain inside the action bar next to
		// the Apply control — `fullWidth` on Apply used to push it out.
		const bar = canvasElement.querySelector<HTMLElement>(
			"[data-ws-easing-action-bar]",
		);
		const plus = canvasElement.querySelector<HTMLElement>(
			"[data-ws-action='open-preset-tool-dialog']",
		);
		if (!bar || !plus) throw new Error("action bar or preset button missing");
		expect(boxWithin(measureBox(plus), measureBox(bar), 1)).toBe(true);
	},
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
// the canvas still edits through the mouse fallback handlers.
//
// Issue #145 contract: a plain left-drag ANYWHERE selects the nearest
// handle/point (no distance cap, no empty-area pan). The canvas center is
// empty space in the default linear curve, so this gesture grabs the
// nearest handle, snaps it to the pointer, and follows it — the redraw
// differs because the curve changed, not because the camera panned.
export const MouseOnlyDrag: Story = {
	args: { widthPx: 240, heightPx: 240 },
	play: async ({ canvasElement }) => {
		// Issue #194: widget controls must satisfy the layout contract
		// before and after the drag gesture.
		expectCanvasLayout(canvasElement);
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
		fire("mousedown", 0, 0);
		fire("mousemove", 20, 20);
		fire("mousemove", 45, 45);
		fire("mouseup", 45, 45);
		await new Promise((resolve) => setTimeout(resolve, 300));
		await expect(canvas.toDataURL()).not.toBe(before);
		expectCanvasLayout(canvasElement);
	},
};

// Pan is an explicit gesture only (issue #145): middle-button drag or
// Space+left-drag. This story holds Space, then drags with plain mouse
// events to prove the explicit pan path still moves the camera — and that
// it does NOT edit the curve.
export const SpacePanDrag: Story = {
	args: { widthPx: 240, heightPx: 240 },
	play: async ({ canvasElement }) => {
		// Issue #194: widget controls must satisfy the layout contract
		// before and after the drag gesture.
		expectCanvasLayout(canvasElement);
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
		window.dispatchEvent(
			new KeyboardEvent("keydown", { code: "Space", bubbles: true }),
		);
		try {
			fire("mousedown", 0, 0);
			fire("mousemove", 30, 30);
			fire("mousemove", 60, 60);
			fire("mouseup", 60, 60);
		} finally {
			window.dispatchEvent(
				new KeyboardEvent("keyup", { code: "Space", bubbles: true }),
			);
		}
		await new Promise((resolve) => setTimeout(resolve, 300));
		await expect(canvas.toDataURL()).not.toBe(before);
		expectCanvasLayout(canvasElement);
	},
};

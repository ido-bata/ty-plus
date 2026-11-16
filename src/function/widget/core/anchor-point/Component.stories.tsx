import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "storybook/test";

import { AnchorPointWidget } from "@/function/widget/core/anchor-point/Component";
import type { Layout } from "@/management/workspace/layout/grid-document";
import { css } from "@/styled-system/css";

const layout: Layout = {
	id: "anchor-point-1",
	widgetType: "anchor-point",
	x: 0,
	y: 0,
	width: 1,
	height: 1,
};

type Args = {
	widthPx: number;
};

const baseArgs: Args = {
	widthPx: 240,
};

const meta = {
	title: "WidgetCore/AnchorPoint",
	args: baseArgs,
	argTypes: {
		widthPx: { control: { type: "number", min: 96, max: 480 } },
	},
	render: (args: Args) => (
		<div
			className={css({ padding: "3" })}
			style={{
				width: Math.min(args.widthPx, 320),
				height: Math.min(args.widthPx, 320),
			}}
		>
			<AnchorPointWidget
				{...({
					layout,
					widgetInstanceId: "anchor-point-storybook-1",
				} as unknown as Parameters<typeof AnchorPointWidget>[0])}
			/>
		</div>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const Large: Story = {
	args: { widthPx: 320 },
};

/**
 * Story variant designed for exercising the drag gesture (Issue #77).
 *
 * Hover the widget, press the left mouse button anywhere on the grid, drag
 * straight toward a corner or edge, release. The stroke is mirrored to the
 * same anchor positions that the alignment widget exposes via
 * `useAnchorGesture`.
 */
export const GesturePreview: Story = {
	args: { widthPx: 280 },
	parameters: {
		docs: {
			description: {
				story:
					"Drag the widget's surface to commit an anchor position. Cardinally snapped strokes land on edge anchors; L-shape diagonals land on corners; back-and-forth sweeps over the start point land on `center`.",
			},
		},
	},
};

/**
 * Automated version of the drag gesture for the screenshot pipeline
 * (Issue #146): replays an L-shaped stroke — up, then left — through the
 * same `MouseEvent` fallback path `core/easing`'s `MouseOnlyDrag` story
 * exercises, so the `useAnchorGesture` mousedown/mousemove/mouseup
 * listeners recognize `top-left` and the anchor grid repaints with the
 * selected accent lines. The post-play state is what gets captured.
 */
export const DragToTopLeft: Story = {
	args: { widthPx: 280 },
	play: async ({ canvasElement }) => {
		const grid = canvasElement.querySelector<HTMLElement>(
			"[data-anchor='center']",
		)?.parentElement;
		if (!grid) throw new Error("anchor grid not found");
		const lineOf = (pos: string): CSSStyleDeclaration => {
			const line = canvasElement.querySelector<HTMLElement>(
				`[data-anchor='${pos}'] > span > span`,
			);
			if (!line) throw new Error(`anchor line for ${pos} not found`);
			return getComputedStyle(line);
		};
		const before = lineOf("top-left").backgroundColor;

		const rect = grid.getBoundingClientRect();
		const cx = rect.left + rect.width / 2;
		const cy = rect.top + rect.height / 2;
		const fire = (type: string, x: number, y: number) => {
			grid.dispatchEvent(
				new MouseEvent(type, {
					bubbles: true,
					cancelable: true,
					button: 0,
					buttons: type === "mouseup" ? 0 : 1,
					clientX: x,
					clientY: y,
				}),
			);
		};
		// mousedown on the grid container (not a `data-ws-action` button)
		// starts the gesture; the up-then-left stroke commits segments
		// "top" then "left", which the gesture map resolves to `top-left`.
		fire("mousedown", cx, cy);
		// `useAnchorGesture` attaches its document-level move/end listeners
		// in an effect gated on `isActive`; give React a tick to commit
		// before dispatching the stroke or the moves are dropped.
		await new Promise((resolve) => setTimeout(resolve, 50));
		fire("mousemove", cx, cy - 50);
		fire("mousemove", cx - 50, cy - 50);
		fire("mouseup", cx - 50, cy - 50);
		await new Promise((resolve) => setTimeout(resolve, 300));

		await expect(lineOf("top-left").backgroundColor).not.toBe(before);
	},
};

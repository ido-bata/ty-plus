import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "storybook/test";

import { AnchorPointWidget } from "@/function/widget/core/anchor-point/Component";
import type { Layout } from "@/management/workspace/layout/grid-document";
import { expectCanvasLayout } from "@/storybook/quality/layout";
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

export const Default: Story = {
	// Issue #194: initial-state layout contract.
	play: async ({ canvasElement }) => {
		expectCanvasLayout(canvasElement);
	},
};

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
		// Issue #194: widget controls satisfy the layout contract before
		// and after the drag gesture commits the anchor.
		expectCanvasLayout(canvasElement);
		// `data-anchor` lives on the cell's hit-area button; the visible
		// crosshair lines are siblings under the cell surface one level up.
		const cellOf = (pos: string): HTMLElement | null =>
			canvasElement.querySelector<HTMLElement>(`[data-anchor='${pos}']`)
				?.parentElement ?? null;
		const grid = cellOf("center")?.parentElement;
		if (!grid) throw new Error("anchor grid not found");
		const lineOf = (pos: string): CSSStyleDeclaration => {
			const line = cellOf(pos)?.querySelector<HTMLElement>(
				":scope > span > span",
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
		expectCanvasLayout(canvasElement);
	},
};

/**
 * Issue #724: the legacy `anchor-point-widget.scss` brightened each cell's
 * crosshair on hover — idle lines stepped text @0.35 → 0.75 and the
 * selected accent line stepped to full opacity — with rounded line caps
 * and a 150ms colour fade. The React port dropped that feedback; this
 * story pins the restored contract on computed styles.
 */
export const HoverFeedback: Story = {
	args: { widthPx: 280 },
	play: async ({ canvasElement }) => {
		expectCanvasLayout(canvasElement);
		const hitAreaOf = (pos: string): HTMLElement => {
			const el = canvasElement.querySelector<HTMLElement>(
				`[data-anchor='${pos}']`,
			);
			if (!el) throw new Error(`hit area for ${pos} not found`);
			return el;
		};
		const lineOf = (pos: string): CSSStyleDeclaration => {
			const line = hitAreaOf(pos).parentElement?.querySelector<HTMLElement>(
				":scope > span > span",
			);
			if (!line) throw new Error(`anchor line for ${pos} not found`);
			return getComputedStyle(line);
		};

		// Resting contract: idle lines sit at the `ws-anchor-grid-line`
		// alpha (0.35); the default-selected `center` cell uses the accent
		// channel at `ws-anchor-center-line` (0.9).
		expect(lineOf("top-left").backgroundColor).toContain("0.35");
		expect(lineOf("center").backgroundColor).toContain("0.9");

		const { hoverAndAssert } = await import("@/storybook/quality/layout");
		// Hover an idle cell → its crosshair steps to the hover alpha. The
		// settle must outlast the restored 150ms colour transition.
		await hoverAndAssert(hitAreaOf("top-left"), { settleMs: 300 });
		const hoveredIdle = lineOf("top-left").backgroundColor;
		expect(hoveredIdle).toContain("0.75");
		expect(hoveredIdle).not.toContain("0.35");

		// Hover the selected center cell → the accent line steps to full
		// opacity (the legacy `--color-accent-hover` step).
		await hoverAndAssert(hitAreaOf("center"), { settleMs: 300 });
		const hoveredSelected = lineOf("center").backgroundColor;
		expect(hoveredSelected).toContain("88, 166, 255");
		expect(hoveredSelected).not.toContain("0.9");
	},
};

import type { Meta, StoryObj } from "@storybook/react";
import type { JSX } from "react";
import { expect, waitFor, within } from "storybook/test";
import { css } from "@/styled-system/css";

import { WidgetTutorialLayer } from "./WidgetTutorialLayer";

/**
 * Tutorial layer wrapper (Issue #610).
 *
 * The layer paints nothing of its own — it wraps the widget body and
 * auto-opens the first-run coach-mark tour once per widget type +
 * content version (tracked in `settings/tutorial-state.json`). With an
 * empty tutorial state — the Storybook default — mounting an `easing`
 * widget opens the tour automatically, which is exactly the state this
 * story captures. A widget type without tutorial metadata renders its
 * children untouched.
 */

const mockWidgetStyle = css({
	position: "relative",
	display: "flex",
	height: "220px",
	width: "320px",
	flexDirection: "column",
	gap: "2",
	padding: "2",
	borderRadius: "shell",
	borderWidth: "hairline",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.widget",
});

const mockCanvasStyle = css({
	flex: "1",
	borderRadius: "shell-sm",
	backgroundColor: "surface.panel",
	borderWidth: "hairline",
	borderStyle: "solid",
	borderColor: "border.subtle",
	// Stand-in for the easing curve the tour text refers to — an empty
	// well reads as a broken fixture in captures.
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
});

const mockApplyStyle = css({
	height: "6",
	borderRadius: "shell-sm",
	borderWidth: "0",
	backgroundColor: "text.accent",
	color: "surface.panel",
	fontSize: "shell-sm",
});

function MockWidgetBody(): JSX.Element {
	return (
		<>
			<div data-tutorial-target="easing-canvas" className={mockCanvasStyle}>
				<svg width="120" height="48" viewBox="0 0 120 48" aria-hidden="true">
					<line
						x1="8"
						y1="42"
						x2="112"
						y2="42"
						stroke="var(--ty-text-muted)"
						strokeWidth="1"
					/>
					<line
						x1="8"
						y1="6"
						x2="8"
						y2="42"
						stroke="var(--ty-text-muted)"
						strokeWidth="1"
					/>
					<path
						d="M 8 42 C 40 42, 48 6, 80 6 S 104 42, 112 30"
						fill="none"
						stroke="var(--color-text-accent)"
						strokeWidth="2"
					/>
				</svg>
			</div>
			<button
				type="button"
				data-tutorial-target="easing-apply"
				className={mockApplyStyle}
			>
				Apply
			</button>
		</>
	);
}

function LayerHarness(props: { widgetType: string }): JSX.Element {
	return (
		<WidgetTutorialLayer widgetType={props.widgetType}>
			<div className={mockWidgetStyle}>
				<MockWidgetBody />
			</div>
		</WidgetTutorialLayer>
	);
}

const meta = {
	title: "Management/Tutorial/WidgetTutorialLayer",
	args: {
		widgetType: "easing",
	},
	render: (args): JSX.Element => <LayerHarness widgetType={args.widgetType} />,
} satisfies Meta<{ widgetType: string }>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * First-run auto tour: `easing` has tutorial metadata and the tutorial
 * state store is empty, so the coach-mark tour opens on mount.
 */
export const AutoTourOpens: Story = {
	play: async ({ canvasElement }) => {
		// The tour opens after an async tutorial-state read and portals a
		// `<dialog>` bubble to document.body — poll until it appears.
		await waitFor(() => {
			expect(
				within(document.body).queryAllByRole("dialog").length,
			).toBeGreaterThan(0);
		});

		// #755: the coach-mark must stay anchored to the widget — a stale
		// capture once showed it flung to the viewport bottom-center,
		// detached from its caret target. Measure both boxes: the bubble is
		// placed just below (or above) the anchor with an 8px gap, so its
		// top must sit near the widget's vertical span, not near the
		// viewport bottom.
		const dialog = await within(document.body).findByRole("dialog");
		const canvas = canvasElement.querySelector<HTMLElement>(
			'[data-tutorial-target="easing-canvas"]',
		);
		// The tutorial target sits inside the mock widget root, which is
		// the layer's first element child the tour anchors to.
		const widget = canvas?.parentElement ?? null;
		expect(widget).toBeTruthy();
		const dr = dialog.getBoundingClientRect();
		const wr = widget?.getBoundingClientRect();
		expect(wr).toBeTruthy();
		if (wr) {
			expect(dr.top).toBeGreaterThan(wr.top - wr.height);
			expect(dr.top).toBeLessThan(wr.bottom + 160);
			expect(
				Math.abs(dr.left + dr.width / 2 - (wr.left + wr.width / 2)),
			).toBeLessThan(240);
		}
	},
};

/** Widget type without tutorial metadata — layer renders children only. */
export const NoTutorial: Story = {
	args: { widgetType: "no-such-widget-type" },
};

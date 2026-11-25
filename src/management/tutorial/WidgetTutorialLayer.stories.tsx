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
			<div data-tutorial-target="easing-canvas" className={mockCanvasStyle} />
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
	play: async () => {
		// The tour opens after an async tutorial-state read and portals a
		// `<dialog>` bubble to document.body — poll until it appears.
		await waitFor(() => {
			expect(
				within(document.body).queryAllByRole("dialog").length,
			).toBeGreaterThan(0);
		});
	},
};

/** Widget type without tutorial metadata — layer renders children only. */
export const NoTutorial: Story = {
	args: { widgetType: "no-such-widget-type" },
};

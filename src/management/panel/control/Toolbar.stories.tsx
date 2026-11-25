import type { Decorator, Meta, StoryObj } from "@storybook/react";
import type { JSX } from "react";
import {
	type CpPersistedState,
	initCpStateCache,
} from "@/management/panel/control/state";
import { css } from "@/styled-system/css";

import { Toolbar } from "./Toolbar";

/**
 * Floating control-panel toolbar (Issue #610).
 *
 * `Toolbar` reads its position/orientation/collapsed state from the
 * module-level cache in `control/state.ts` (`readCpState`). Each story
 * seeds that cache through `initCpStateCache` in a decorator so the
 * `useState` initializer picks up the intended state. The toolbar is
 * `position: fixed`, so it renders against the viewport — the frame is
 * only there to give the canvas a stable size.
 */

const frameStyle = css({
	position: "relative",
	height: "240px",
	width: "320px",
	borderRadius: "shell-lg",
	borderWidth: "hairline",
	borderStyle: "dashed",
	borderColor: "border.default",
});

const withCpState =
	(state: CpPersistedState, panelId = "panel-1"): Decorator =>
	(Story) => {
		initCpStateCache(state, panelId);
		return <Story />;
	};

const meta = {
	title: "Management/Panel/ControlToolbar",
	args: {
		panelId: "panel-1",
	},
	render: (args): JSX.Element => (
		<div className={frameStyle}>
			<Toolbar panelId={args.panelId} />
		</div>
	),
} satisfies Meta<{ panelId?: string }>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Expanded horizontal toolbar, bottom-right (panel-1 default). */
export const Expanded: Story = {
	decorators: [
		withCpState({
			position: "bottom-right",
			orientation: "horizontal",
			collapsed: false,
		}),
	],
};

/** Vertical orientation — preset/widget buttons stack in a column. */
export const Vertical: Story = {
	decorators: [
		withCpState({
			position: "right-center",
			orientation: "vertical",
			collapsed: false,
		}),
	],
};

/** Collapsed state — renders as the small circular handle only. */
export const Collapsed: Story = {
	args: { panelId: "panel-2" },
	decorators: [
		withCpState(
			{
				position: "bottom-right",
				orientation: "horizontal",
				collapsed: true,
			},
			"panel-2",
		),
	],
};

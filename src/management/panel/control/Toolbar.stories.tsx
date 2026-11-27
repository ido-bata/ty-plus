import type { Decorator, Meta, StoryObj } from "@storybook/react";
import type { JSX } from "react";
import { expect } from "storybook/test";
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

/**
 * Issue #752: every toolbar IconButton must render as a square target.
 * `size="sm"` (7x7) and the local `iconBtnSize` class (6x6) both set
 * height/width; if Panda's atomic ordering ever resolves the two
 * properties to different winners the button paints non-square.
 */
const expectSquareTargets = (canvasElement: HTMLElement): void => {
	const buttons = canvasElement.querySelectorAll<HTMLElement>(
		".ty-control-panel button",
	);
	expect(buttons.length).toBeGreaterThan(0);
	for (const button of buttons) {
		const rect = button.getBoundingClientRect();
		expect(
			Math.abs(rect.width - rect.height),
			`toolbar button is not square: ${rect.width}x${rect.height}`,
		).toBeLessThanOrEqual(0.5);
		expect(rect.width).toBeGreaterThanOrEqual(24);
		expect(rect.height).toBeGreaterThanOrEqual(24);
	}
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
	play: async ({ canvasElement }) => {
		expectSquareTargets(canvasElement);
	},
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
	play: async ({ canvasElement }) => {
		expectSquareTargets(canvasElement);
	},
};

/** Collapsed state — small circular handle with an expand affordance. */
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
	play: async ({ canvasElement }) => {
		// Issue #708: the expand affordance must stay a usable pointer
		// target — WCAG 2.5.8 minimum is 24x24 CSS px.
		const toggle = canvasElement.querySelector<HTMLElement>(
			'[data-ws-action="ty.ctx.cp.toggle-collapse"]',
		);
		if (!toggle) throw new Error("collapsed toggle not found");
		const rect = toggle.getBoundingClientRect();
		expect(rect.width).toBeGreaterThanOrEqual(24);
		expect(rect.height).toBeGreaterThanOrEqual(24);

		// Issue #752: the collapsed handle must paint its expand icon —
		// a blank dot means the svg lost size, color, or visibility.
		const icon = toggle.querySelector("svg");
		if (!icon) throw new Error("collapsed toggle icon not found");
		const iconRect = icon.getBoundingClientRect();
		expect(iconRect.width).toBeGreaterThanOrEqual(8);
		expect(iconRect.height).toBeGreaterThanOrEqual(8);
		const iconStyle = getComputedStyle(icon);
		expect(iconStyle.visibility).not.toBe("hidden");
		expect(iconStyle.display).not.toBe("none");
		expect(Number(iconStyle.opacity)).toBeGreaterThan(0);
		// The icon must be the topmost paint at its own center — catches
		// a same-color icon on the shell or an occluding layer.
		const hit = document.elementFromPoint(
			iconRect.left + iconRect.width / 2,
			iconRect.top + iconRect.height / 2,
		);
		expect(
			hit === icon || icon.contains(hit) || hit?.contains(icon),
			"collapsed toggle icon is not the topmost painted element",
		).toBe(true);
	},
};

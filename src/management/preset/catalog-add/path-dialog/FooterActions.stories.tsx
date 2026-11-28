import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "storybook/test";
import { measureBox } from "@/storybook/quality/layout";
import { css } from "@/styled-system/css";

import { PathDialogFooterActions } from "./FooterActions";

type Args = {
	busy: boolean;
	canAdd: boolean;
};

const baseArgs: Args = {
	busy: false,
	canAdd: true,
};

const decoratorBoxClass = css({
	width: "28rem",
	padding: "2",
});

const meta = {
	title: "Preset/CatalogAdd/PathDialog/FooterActions",
	args: baseArgs,
	argTypes: {
		busy: { control: "boolean" },
		canAdd: { control: "boolean" },
	},
	decorators: [
		(Story) => (
			<div className={decoratorBoxClass}>
				<Story />
			</div>
		),
	],
	render: (args: Args) => (
		<PathDialogFooterActions
			close={() => undefined}
			busy={args.busy}
			canAdd={args.canAdd}
			handleAdd={async () => undefined}
		/>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {
	play: async ({ canvasElement }) => {
		// Issue #777: footer contract — the primary action is text-only;
		// no footer button may render a leading icon here.
		const actions = canvasElement.querySelector("[data-dialog-footer-actions]");
		if (!actions) throw new Error("footer actions not found");
		const buttons = actions.querySelectorAll("button");
		expect(buttons.length).toBeGreaterThan(0);
		for (const button of buttons) {
			expect(button.querySelector("svg")).toBeNull();
		}
	},
};

export const Disabled: Story = {
	args: { canAdd: false },
};

export const Busy: Story = {
	// PathDialog derives `canAdd` as `... && !busy` (PathDialog.tsx).
	args: { busy: true, canAdd: false },
	play: async ({ canvasElement }) => {
		const buttons = canvasElement.querySelectorAll("button");
		expect(buttons).toHaveLength(2);
		// Issue #797: Cancel is disabled while the primary keeps full
		// contrast — `aria-disabled` + a click guard carry the busy
		// semantics so "Creating…" reads as progress, not disabled.
		expect(buttons[0]).toBeDisabled();
		expect(buttons[1]).not.toBeDisabled();
		expect(buttons[1]?.getAttribute("aria-disabled")).toBe("true");
		expect(buttons[1]?.textContent).toContain("Creating");
	},
};

const rowClass = css({
	display: "flex",
	width: "full",
	alignItems: "flex-start",
	gap: "4",
});

/*
 * Issue #797: the footer must not resize when the primary label swaps
 * "Create" → "Creating…". Render both states side by side and pin the
 * measured widths — a regression shows up as a width delta, not a
 * screenshot difference.
 */
export const BusyWidthStable: Story = {
	parameters: { layout: "fullscreen" },
	render: () => (
		<div className={rowClass}>
			<PathDialogFooterActions
				close={() => undefined}
				busy={false}
				canAdd
				handleAdd={async () => undefined}
			/>
			<PathDialogFooterActions
				close={() => undefined}
				busy
				canAdd={false}
				handleAdd={async () => undefined}
			/>
		</div>
	),
	play: ({ canvasElement }) => {
		const rows = canvasElement.querySelectorAll("[data-dialog-footer-actions]");
		expect(rows).toHaveLength(2);
		for (const row of rows) {
			const buttons = row.querySelectorAll("button");
			expect(buttons).toHaveLength(2);
			const [cancelBox, primaryBox] = [
				measureBox(buttons[0]),
				measureBox(buttons[1]),
			];
			expect(Math.abs(cancelBox.width - primaryBox.width)).toBeLessThanOrEqual(
				1,
			);
		}
		const defaultRow = rows[0];
		const busyRow = rows[1];
		if (!defaultRow || !busyRow) throw new Error("footer rows not found");
		const defaultButtons = defaultRow.querySelectorAll("button");
		const busyButtons = busyRow.querySelectorAll("button");
		for (let i = 0; i < 2; i++) {
			expect(
				Math.abs(
					measureBox(defaultButtons[i]).width -
						measureBox(busyButtons[i]).width,
				),
			).toBeLessThanOrEqual(1);
		}
	},
};

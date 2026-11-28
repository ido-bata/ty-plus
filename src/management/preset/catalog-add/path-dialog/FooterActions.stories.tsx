import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "storybook/test";
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
	// PathDialog derives `canAdd` as `... && !busy` (PathDialog.tsx), so
	// the busy state never leaves the create button enabled (#455).
	args: { busy: true, canAdd: false },
	play: async ({ canvasElement }) => {
		const buttons = canvasElement.querySelectorAll("button");
		expect(buttons).toHaveLength(2);
		for (const button of buttons) {
			expect(button).toBeDisabled();
		}
		expect(buttons[1]?.textContent).toContain("Creating");
	},
};

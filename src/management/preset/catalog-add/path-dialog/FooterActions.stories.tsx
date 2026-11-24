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

export const Default: Story = {};

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

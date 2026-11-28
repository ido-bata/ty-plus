import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "storybook/test";
import { storyT } from "@/storybook/i18n-story-t";
import { css } from "@/styled-system/css";

import { ToolDialogFooter } from "./Footer";

type Args = {
	busy: boolean;
};

const baseArgs: Args = {
	busy: false,
};

const decoratorBoxClass = css({
	width: "28rem",
	padding: "2",
});

const meta = {
	title: "Preset/ToolShell/Dialog/Footer",
	args: baseArgs,
	argTypes: {
		busy: { control: "boolean" },
	},
	decorators: [
		(Story) => (
			<div className={decoratorBoxClass}>
				<Story />
			</div>
		),
	],
	render: (args: Args) => (
		<ToolDialogFooter
			close={() => undefined}
			busy={args.busy}
			t={storyT("presets")}
			onSave={async () => undefined}
		/>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {
	play: async ({ canvasElement }) => {
		// Issue #777: footer contract — primary (and ghost cancel) actions
		// are text-only; neither footer button may render an icon.
		const actions = canvasElement.querySelector("[data-dialog-footer-actions]");
		if (!actions) throw new Error("footer actions not found");
		const buttons = actions.querySelectorAll("button");
		expect(buttons).toHaveLength(2);
		for (const button of buttons) {
			expect(button.querySelector("svg")).toBeNull();
		}
	},
};

export const Saving: Story = {
	args: { busy: true },
};

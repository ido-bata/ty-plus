import type { Meta, StoryObj } from "@storybook/react";
import { css } from "@/styled-system/css";

import { ToolDialogFooter } from "./DialogFooter";

const stubT = (key: string): string => {
	const map: Record<string, string> = {
		"presetTool.cancel": "Cancel",
		"presetTool.create": "Create",
		"presetTool.status.saving": "Saving...",
	};
	return map[key] ?? key;
};

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
	title: "Preset/ToolShell/DialogFooter",
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
			t={stubT}
			onSave={async () => undefined}
		/>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const Saving: Story = {
	args: { busy: true },
};

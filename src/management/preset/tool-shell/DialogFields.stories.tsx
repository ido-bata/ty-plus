import type { Meta, StoryObj } from "@storybook/react";
import { css } from "@/styled-system/css";

import type { PresetToolField } from "./Dialog";
import { ToolDialogFields } from "./DialogFields";

const baseFields: PresetToolField[] = [
	{ key: "title", label: "Title", placeholder: "Title", kind: "input" },
	{
		key: "mode",
		label: "Mode",
		kind: "select",
		options: [
			{ value: "fast", label: "Fast" },
			{ value: "slow", label: "Slow" },
		],
	},
	{ key: "enabled", label: "Enabled", kind: "checkbox" },
	{
		key: "notes",
		label: "Notes",
		placeholder: "Optional notes",
		kind: "textarea",
	},
];

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
	title: "Preset/ToolShell/DialogFields",
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
		<ToolDialogFields
			fields={baseFields}
			values={{ title: "Sample", mode: "fast", enabled: "true", notes: "" }}
			busy={args.busy}
			browseSpecs={[]}
			runPathBrowse={() => undefined}
			setValue={() => undefined}
		/>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const Busy: Story = {
	args: { busy: true },
};

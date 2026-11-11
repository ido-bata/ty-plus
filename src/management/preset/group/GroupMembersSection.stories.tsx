import type { Meta, StoryObj } from "@storybook/react";
import { css } from "@/styled-system/css";

import type { DialogFormContext } from "./GroupMembersSection";
import { GroupMembersSection } from "./GroupMembersSection";

const baseCtx: DialogFormContext = {
	name: "Header Animations",
	setName: () => undefined,
	values: { paths: "/preset/root\n/preset/header", recursive: "false" },
	setValue: () => undefined,
	busy: false,
	fields: null,
	icon: null,
	details: null,
	runPathBrowse: () => undefined,
};

type Args = {
	busy: boolean;
};

const baseArgs: Args = {
	busy: false,
};

const decoratorBoxClass = css({
	width: "40rem",
	padding: "2",
});

const meta = {
	title: "Preset/Group/GroupMembersSection",
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
		<GroupMembersSection
			ctx={{ ...baseCtx, busy: args.busy }}
			candidatePresets={[
				{ id: "p1", title: "Header preset", filePath: "/preset/header.ffx" },
			]}
			candidateDirs={["/preset/header"]}
			detectCandidates={async () => undefined}
			onPickPreset={() => undefined}
		/>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const Busy: Story = {
	args: { busy: true },
};

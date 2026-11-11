import type { Meta, StoryObj } from "@storybook/react";
import { createPresetIconDraft } from "@/management/preset/icon-editor";
import { css } from "@/styled-system/css";
import { ConditionRuleCard } from "./ConditionRuleCard";
import type { ConditionRule } from "./condition-rule-helpers";

const baseRule: ConditionRule = {
	id: "rule-1",
	filterType: "name",
	pattern: "Header",
	matchMode: "contains",
	draft: createPresetIconDraft("RX"),
};

type Args = {
	filterType: ConditionRule["filterType"];
	pattern: string;
};

const baseArgs: Args = {
	filterType: "name",
	pattern: "Header",
};

const decoratorBoxClass = css({
	width: "28rem",
	padding: "2",
});

const meta = {
	title: "Preset/Group/ConditionRuleCard",
	args: baseArgs,
	argTypes: {
		filterType: {
			control: { type: "select" },
			options: ["name", "path", "preset", "presetType"],
		},
		pattern: { control: "text" },
	},
	decorators: [
		(Story) => (
			<div className={decoratorBoxClass}>
				<Story />
			</div>
		),
	],
	render: (args: Args) => {
		const rule: ConditionRule = {
			...baseRule,
			filterType: args.filterType,
			pattern: args.pattern,
		};
		return (
			<ConditionRuleCard
				rule={rule}
				index={0}
				candidatePresets={[
					{ id: "p1", title: "Header preset", filePath: "/preset/header.ffx" },
				]}
				candidateDirs={["/preset/header"]}
				busy={false}
				onChange={() => undefined}
				onRemove={() => undefined}
			/>
		);
	},
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const PathFilter: Story = {
	args: { filterType: "path", pattern: "" },
};

export const PresetFilter: Story = {
	args: { filterType: "preset", pattern: "" },
};

export const PresetTypeFilter: Story = {
	args: { filterType: "presetType", pattern: "" },
};

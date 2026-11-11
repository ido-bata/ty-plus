import type { Meta, StoryObj } from "@storybook/react";
import { createPresetIconDraft } from "@/management/preset/icon-editor";
import { css } from "@/styled-system/css";
import { ConditionRulesSection } from "./ConditionRulesSection";
import type { ConditionRule } from "./condition-rule-helpers";

const baseRules: ConditionRule[] = [
	{
		id: "rule-1",
		filterType: "name",
		pattern: "Header",
		matchMode: "contains",
		draft: createPresetIconDraft("RX"),
	},
];

const baseDraft = createPresetIconDraft("PR");

type Args = {
	busy: boolean;
};

const baseArgs: Args = {
	busy: false,
};

const decoratorBoxClass = css({
	width: "32rem",
	padding: "2",
});

const meta = {
	title: "Preset/Group/ConditionRulesSection",
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
		<ConditionRulesSection
			baseIconDraft={baseDraft}
			onBaseIconDraftChange={() => undefined}
			conditionRules={baseRules}
			candidatePresets={[
				{ id: "p1", title: "Header preset", filePath: "/preset/header.ffx" },
			]}
			candidateDirs={["/preset/header"]}
			busy={args.busy}
			onChangeRule={() => undefined}
			onRemoveRule={() => undefined}
			onAddRule={() => undefined}
		/>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const Busy: Story = {
	args: { busy: true },
};

import type { Meta, StoryObj } from "@storybook/react";
import { createPresetIconDraft } from "@/management/preset/icon-editor";
import { css } from "@/styled-system/css";
import { BaseIconCard } from "./BaseIconCard";

const baseDraft = createPresetIconDraft("PR");

type Args = {
	iconText: string;
};

const baseArgs: Args = {
	iconText: "PR",
};

const decoratorBoxClass = css({
	width: "28rem",
	padding: "2",
});

const meta = {
	title: "Preset/Group/BaseIconCard",
	args: baseArgs,
	argTypes: {
		iconText: { control: "text" },
	},
	decorators: [
		(Story) => (
			<div className={decoratorBoxClass}>
				<Story />
			</div>
		),
	],
	render: (args: Args) => (
		<BaseIconCard
			baseIconDraft={{ ...baseDraft, text: args.iconText }}
			onBaseIconDraftChange={() => undefined}
		/>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const Emoji: Story = {
	render: () => (
		<BaseIconCard
			baseIconDraft={{ ...baseDraft, type: "emoji", emoji: "✨", text: "" }}
			onBaseIconDraftChange={() => undefined}
		/>
	),
};

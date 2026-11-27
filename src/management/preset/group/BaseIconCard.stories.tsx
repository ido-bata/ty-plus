import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "storybook/test";
import { createPresetIconDraft } from "@/management/preset/icon/editor-state";
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

export const Default: Story = {
	play: async ({ canvasElement }) => {
		// Issue #753: the card supplies the "Base icon (default…)" heading —
		// the nested editor must not repeat a "Base icon" label or draw a
		// second frame inside the card.
		const headings = Array.from(canvasElement.querySelectorAll("span")).filter(
			(el) => el.textContent?.trim() === "Base icon",
		);
		expect(headings).toHaveLength(0);
	},
};

export const Emoji: Story = {
	render: () => (
		<BaseIconCard
			baseIconDraft={{ ...baseDraft, type: "emoji", emoji: "✨", text: "" }}
			onBaseIconDraftChange={() => undefined}
		/>
	),
};

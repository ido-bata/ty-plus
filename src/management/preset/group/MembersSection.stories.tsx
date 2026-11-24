import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "storybook/test";
import { css } from "@/styled-system/css";

import type { DialogFormContext } from "./MembersSection";
import { MembersSection } from "./MembersSection";

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
	title: "Preset/Group/MembersSection",
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
		<MembersSection
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

// #459: the I18nDecorator locale upgrade used to flip mid-render and
// produce ja/en mixed chrome. Storybook is english-fixed, so both
// stories must render the English labels and no CJK text.
const expectEnglishChrome = (canvasElement: HTMLElement): void => {
	const text = canvasElement.textContent ?? "";
	expect(text).toContain("Add path");
	expect(text).toContain("Detect candidates");
	expect(text).not.toMatch(/[぀-ヿ一-鿿]/);
};

export const Default: Story = {
	play: async ({ canvasElement }) => {
		expectEnglishChrome(canvasElement);
	},
};

export const Busy: Story = {
	args: { busy: true },
	play: async ({ canvasElement }) => {
		expectEnglishChrome(canvasElement);
	},
};

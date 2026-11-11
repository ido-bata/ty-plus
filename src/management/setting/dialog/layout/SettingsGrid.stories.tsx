import type { Meta, StoryObj } from "@storybook/react";
import { Input } from "@/shared/component/fields/Input";
import { css } from "@/styled-system/css";

import {
	SettingsField,
	SettingsFieldLabel,
	SettingsGrid,
	SettingsSectionHeading,
} from "./SettingsGrid";

type Args = {
	spanA: 1 | 2 | 3 | 4 | 5 | 6;
	spanB: 1 | 2 | 3 | 4 | 5 | 6;
	spanC: 1 | 2 | 3 | 4 | 5 | 6;
};

const baseArgs: Args = {
	spanA: 3,
	spanB: 3,
	spanC: 6,
};

const frameStyle = css({
	width: "480px",
	padding: "3",
});

const meta = {
	title: "Setting/SettingsGrid",
	args: baseArgs,
	argTypes: {
		spanA: {
			control: { type: "inline-radio" },
			options: [1, 2, 3, 4, 5, 6],
		},
		spanB: {
			control: { type: "inline-radio" },
			options: [1, 2, 3, 4, 5, 6],
		},
		spanC: {
			control: { type: "inline-radio" },
			options: [1, 2, 3, 4, 5, 6],
		},
	},
	render: (args: Args) => (
		<div className={frameStyle}>
			<SettingsGrid>
				<SettingsSectionHeading>Workspace</SettingsSectionHeading>
				<SettingsField span={args.spanA}>
					<SettingsFieldLabel>Cell padding</SettingsFieldLabel>
					<Input uiSize="sm" defaultValue="8" />
				</SettingsField>
				<SettingsField span={args.spanB}>
					<SettingsFieldLabel>Border radius</SettingsFieldLabel>
					<Input uiSize="sm" defaultValue="6" />
				</SettingsField>
				<SettingsField span={args.spanC}>
					<SettingsFieldLabel>Description</SettingsFieldLabel>
					<Input uiSize="sm" defaultValue="Long row spanning the full grid" />
				</SettingsField>
			</SettingsGrid>
		</div>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const TwoEqualColumns: Story = {
	args: { spanA: 3, spanB: 3, spanC: 6 },
};

export const ThreeColumns: Story = {
	args: { spanA: 2, spanB: 2, spanC: 2 },
};

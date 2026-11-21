import type { Meta, StoryObj } from "@storybook/react";
import type { ReactNode } from "react";
import { CollapsibleGroupHeader } from "./CollapsibleGroupHeader";

type Args = {
	title: string;
	count: number;
	defaultOpen: boolean;
	children: ReactNode;
	onToggle: ((isOpen: boolean) => void) | undefined;
};

const SampleChild = (): ReactNode => (
	<div
		style={{
			padding: "4px 8px",
			fontSize: 11,
			color: "#a0a0a0",
		}}
	>
		3 presets in this group
	</div>
);

const meta = {
	title: "DirectoryBrowser/CollapsibleGroupHeader",
	component: CollapsibleGroupHeader,
	args: {
		title: "Glow Effects",
		count: 12,
		defaultOpen: true,
		children: <SampleChild />,
		onToggle: undefined,
	},
	decorators: [
		(Story) => (
			<div style={{ minWidth: 280, padding: 8, background: "#252525" }}>
				<Story />
			</div>
		),
	],
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Closed: Story = {
	args: { defaultOpen: false },
};

export const ManyItems: Story = {
	args: { count: 248, title: "Motion presets" },
};

export const ZeroCount: Story = {
	args: { count: 0, title: "Empty group" },
};

export const WithToggleHandler: Story = {
	args: { onToggle: () => undefined, title: "Transitions" },
};

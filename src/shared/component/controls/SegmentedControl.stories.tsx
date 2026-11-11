import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

import {
	SegmentedControl,
	type SegmentedControlProps,
} from "./SegmentedControl";

const options = [
	{ value: "all", label: "All" },
	{ value: "active", label: "Active" },
	{ value: "archived", label: "Archived" },
];

function ControlledSegmentedControl(props: SegmentedControlProps) {
	const [value, setValue] = useState(props.value);
	return <SegmentedControl {...props} value={value} onChange={setValue} />;
}

const meta = {
	title: "Shared/Controls/SegmentedControl",
	component: SegmentedControl,
	argTypes: {
		options: { control: "object" },
		value: { control: "text" },
		onChange: { action: "changed" },
		"aria-label": { control: "text" },
		className: { control: "text" },
		buttonClassName: { control: "text" },
		selectedClassName: { control: "text" },
		unselectedClassName: { control: "text" },
	},
	args: {
		options,
		value: "all",
		onChange: () => undefined,
		"aria-label": "Filter items",
	},
} satisfies Meta<typeof SegmentedControl>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	render: (args) => <ControlledSegmentedControl {...args} />,
};

export const ActiveSelected: Story = {
	args: { value: "active" },
	render: (args) => <ControlledSegmentedControl {...args} />,
};

export const CustomLabels: Story = {
	args: {
		options: [
			{ value: "design", label: "Design" },
			{ value: "motion", label: "Motion" },
		],
		value: "motion",
		"aria-label": "Asset type",
	},
	render: (args) => <ControlledSegmentedControl {...args} />,
};

export const CustomColors: Story = {
	args: {
		selectedClassName: "bg-text-primary text-surface-panel",
		unselectedClassName:
			"bg-surface-widget text-text-muted hover:bg-interactive-hover hover:text-text-primary",
	},
	render: (args) => <ControlledSegmentedControl {...args} />,
};

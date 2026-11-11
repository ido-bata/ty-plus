import type { Meta, StoryObj } from "@storybook/react";
import { Check, MoreHorizontal, Plus } from "lucide-react";
import { css } from "@/styled-system/css";

import { IconButton } from "./IconButton";

const meta = {
	title: "Shared/Controls/IconButton",
	component: IconButton,
	argTypes: {
		variant: {
			control: { type: "select" },
			options: ["ghost", "default"],
		},
		size: {
			control: { type: "select" },
			options: ["sm", "md", "lg"],
		},
		disabled: { control: "boolean" },
		"aria-label": { control: "text" },
		children: { control: false },
	},
	args: {
		variant: "ghost",
		size: "md",
		disabled: false,
		"aria-label": "Add item",
	},
} satisfies Meta<typeof IconButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	play: ({ canvasElement }) => {
		const icon = canvasElement.querySelector("button svg");
		if (!icon) throw new Error("Button icon did not render");
		const style = getComputedStyle(icon);
		if (style.flexShrink !== "0" || style.pointerEvents !== "none") {
			throw new Error("Button descendant icon styles were not applied");
		}
	},
	render: (args) => (
		<IconButton {...args}>
			<Plus />
		</IconButton>
	),
};

export const Disabled: Story = {
	args: { disabled: true, "aria-label": "Completed" },
	render: (args) => (
		<IconButton {...args}>
			<Check />
		</IconButton>
	),
};

export const VariantsAndSizes: Story = {
	render: (args) => (
		<div className={css({ display: "flex", alignItems: "center", gap: "2" })}>
			<IconButton {...args} variant="ghost" size="sm" aria-label="Small ghost">
				<MoreHorizontal />
			</IconButton>
			<IconButton {...args} variant="ghost" size="md" aria-label="Medium ghost">
				<MoreHorizontal />
			</IconButton>
			<IconButton
				{...args}
				variant="default"
				size="md"
				aria-label="Medium default"
			>
				<MoreHorizontal />
			</IconButton>
			<IconButton
				{...args}
				variant="default"
				size="lg"
				aria-label="Large default"
			>
				<MoreHorizontal />
			</IconButton>
		</div>
	),
};

export const AllSizes: Story = {
	render: (args) => (
		<div className={css({ display: "flex", alignItems: "center", gap: "2" })}>
			<IconButton {...args} size="sm" aria-label="Small">
				<Plus />
			</IconButton>
			<IconButton {...args} size="md" aria-label="Medium">
				<Plus />
			</IconButton>
			<IconButton {...args} size="lg" aria-label="Large">
				<Plus />
			</IconButton>
		</div>
	),
};

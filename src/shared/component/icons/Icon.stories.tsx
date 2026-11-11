import type { Meta, StoryObj } from "@storybook/react";
import { Library, Save, Settings, X } from "lucide-react";
import { css } from "@/styled-system/css";

import { Icon } from "./Icon";

type Args = {
	iconName: "library" | "save" | "settings" | "close";
	size: number;
	className: string;
	ariaHidden: boolean;
};

const ICONS = {
	library: Library,
	save: Save,
	settings: Settings,
	close: X,
} as const;

const baseArgs: Args = {
	iconName: "library",
	size: 16,
	className: "",
	ariaHidden: true,
};

const renderIcon = (args: Args) => {
	const IconComponent = ICONS[args.iconName];
	return (
		<div
			className={css({
				display: "flex",
				alignItems: "center",
				gap: "2",
				p: "2",
				color: "text.primary",
			})}
		>
			<Icon
				icon={IconComponent}
				size={args.size}
				className={args.className}
				aria-hidden={args.ariaHidden}
			/>
			<span className={css({ fontSize: "sm", color: "text.muted" })}>
				{args.iconName} @ {args.size}px
			</span>
		</div>
	);
};

const meta = {
	title: "Shared/Icons/Icon",
	args: baseArgs,
	argTypes: {
		iconName: {
			control: { type: "select" },
			options: ["library", "save", "settings", "close"],
		},
		size: {
			control: { type: "range", min: 8, max: 48, step: 1 },
		},
		className: { control: "text" },
		ariaHidden: { control: "boolean" },
	},
	render: renderIcon,
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const Size12: Story = {
	args: { size: 12 },
};

export const Size24: Story = {
	args: { size: 24 },
};

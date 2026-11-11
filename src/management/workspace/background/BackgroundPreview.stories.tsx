import type { Meta, StoryObj } from "@storybook/react";
import type { CSSProperties } from "react";
import { BackgroundPreview } from "@/management/workspace/background/BackgroundPreview";
import { css } from "@/styled-system/css";

type Args = {
	status: string;
	background: string;
	withPattern: boolean;
};

const stubT = (key: string, options?: Record<string, unknown>): string => {
	if (
		options &&
		"defaultValue" in options &&
		typeof options.defaultValue === "string"
	) {
		return options.defaultValue as string;
	}
	return key;
};

const baseArgs: Args = {
	status: "3 layers · 1920x1080",
	background: "#1e1e1e",
	withPattern: false,
};

const buildStyle = (args: Args): CSSProperties => ({
	backgroundColor: args.background,
	backgroundImage: args.withPattern
		? "radial-gradient(circle, rgba(255,255,255,0.12) 1px, transparent 1px)"
		: undefined,
	backgroundSize: args.withPattern ? "12px 12px" : undefined,
});

const meta = {
	title: "Background/BackgroundPreview",
	args: baseArgs,
	argTypes: {
		status: { control: "text" },
		background: { control: "color" },
		withPattern: { control: "boolean" },
	},
	render: (args: Args) => (
		<div
			className={css({
				display: "flex",
				height: "72",
				width: "360px",
				flexDirection: "column",
				p: "3",
			})}
		>
			<BackgroundPreview
				previewStyle={buildStyle(args)}
				status={args.status}
				t={stubT}
			/>
		</div>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const SolidBlue: Story = {
	args: { background: "#4facfe" },
};

export const Dotted: Story = {
	args: { withPattern: true },
};

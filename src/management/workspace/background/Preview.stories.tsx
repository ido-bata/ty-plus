import type { Meta, StoryObj } from "@storybook/react";
import type { CSSProperties } from "react";
import { BackgroundPreview } from "@/management/workspace/background/Preview";
import { storyT } from "@/storybook/i18n-story-t";
import { css } from "@/styled-system/css";

type Args = {
	status: string;
	background: string;
	withPattern: boolean;
};

const baseArgs: Args = {
	// Issue #795: the status slot mirrors the dialog's real states
	// (save/load feedback), which never include comp dimensions — the old
	// "3 layers · 1920x1080" fixture implied a 16:9 frame the thumbnail
	// does not have and got flagged as an aspect defect.
	status: "Saved",
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
				t={storyT("dialogs")}
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

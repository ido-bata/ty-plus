import type { Meta, StoryObj } from "@storybook/react";
import { css } from "@/styled-system/css";

import { Content } from "./Content";

type Args = {
	showText: boolean;
	padding: boolean;
};

const baseArgs: Args = {
	showText: true,
	padding: false,
};

const meta = {
	title: "Dialog/Shell/Content",
	args: baseArgs,
	argTypes: {
		showText: { control: "boolean" },
		padding: { control: "boolean" },
	},
	render: (args: Args) => (
		<div
			className={css({
				display: "flex",
				height: "72",
				width: "80",
				flexDirection: "column",
				borderRadius: "shell-sm",
				borderWidth: "1px",
				borderStyle: "solid",
				borderColor: "border.default",
				bg: "surface.dialog",
			})}
		>
			<Content>
				<div className={args.padding ? css({ p: "3" }) : ""}>
					{args.showText ? (
						<p
							className={css({
								margin: "0",
								fontSize: "text-xs",
								color: "text.muted",
							})}
						>
							Dialog body content. The Content wrapper fills the available
							vertical space and handles scroll behavior.
						</p>
					) : null}
					<div
						className={css({
							display: "grid",
							gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
							gap: "2",
							pt: "2",
						})}
					>
						<div
							className={css({
								height: "10",
								borderRadius: "shell-sm",
								borderWidth: "1px",
								borderStyle: "solid",
								borderColor: "border.default",
								bg: "surface.widget",
							})}
						/>
						<div
							className={css({
								height: "10",
								borderRadius: "shell-sm",
								borderWidth: "1px",
								borderStyle: "solid",
								borderColor: "border.default",
								bg: "surface.widget",
							})}
						/>
						<div
							className={css({
								height: "10",
								borderRadius: "shell-sm",
								borderWidth: "1px",
								borderStyle: "solid",
								borderColor: "border.default",
								bg: "surface.widget",
							})}
						/>
						<div
							className={css({
								height: "10",
								borderRadius: "shell-sm",
								borderWidth: "1px",
								borderStyle: "solid",
								borderColor: "border.default",
								bg: "surface.widget",
							})}
						/>
					</div>
				</div>
			</Content>
		</div>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Minimal: Story = {
	args: { showText: false },
};

export const Scrollable: Story = {
	args: { padding: true },
	render: (args: Args) => (
		<div
			className={css({
				display: "flex",
				height: "72",
				width: "80",
				flexDirection: "column",
				borderRadius: "shell-sm",
				borderWidth: "1px",
				borderStyle: "solid",
				borderColor: "border.default",
				bg: "surface.dialog",
			})}
		>
			<Content>
				{Array.from({ length: 16 }).map((_, i) => (
					<div
						key={`row-${i}`}
						className={css({
							display: "flex",
							alignItems: "center",
							gap: "2",
							borderBottomWidth: "1px",
							borderBottomStyle: "solid",
							borderColor: "border.default",
							py: "2",
							fontSize: "text-xs",
							color: "text.primary",
						})}
					>
						<span
							className={css({
								fontFamily: "mono",
								opacity: 0.6,
							})}
						>
							{String(i + 1).padStart(2, "0")}
						</span>
						<span>Row {i + 1}</span>
					</div>
				))}
				{args.showText ? (
					<p
						className={css({
							margin: "0",
							p: "3",
							fontSize: "text-xs",
							color: "text.muted",
						})}
					>
						Long content scrolls inside the Content frame.
					</p>
				) : null}
			</Content>
		</div>
	),
};

import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "@/shared/component/controls/Button";
import { css } from "@/styled-system/css";

import { WorkspaceShell } from "./DialogShell";

type Args = {
	title: string;
	meta: string;
	modifier: string;
	withFooter: boolean;
	withAfterBody: boolean;
};

const baseArgs: Args = {
	title: "Dialog shell",
	meta: "panel-1",
	modifier: "",
	withFooter: false,
	withAfterBody: false,
};

const meta = {
	title: "CEP/DialogShell",
	args: baseArgs,
	argTypes: {
		title: { control: "text" },
		meta: { control: "text" },
		modifier: { control: "text" },
		withFooter: { control: "boolean" },
		withAfterBody: { control: "boolean" },
	},
	render: (args: Args) => (
		<div
			className={css({
				display: "flex",
				height: "96",
				width: "480px",
				flexDirection: "column",
			})}
		>
			<WorkspaceShell
				rootModifierClasses={args.modifier ? [args.modifier] : []}
				title={args.title}
				meta={args.meta}
				footer={
					args.withFooter ? (
						<div
							className={css({
								display: "flex",
								justifyContent: "flex-end",
								gap: "2",
							})}
						>
							<Button variant="ghost" fullWidth>
								Cancel
							</Button>
							<Button variant="primary" fullWidth>
								Apply
							</Button>
						</div>
					) : null
				}
				afterBody={
					args.withAfterBody ? (
						<div
							className={css({
								borderTopWidth: "1px",
								borderTopStyle: "solid",
								borderColor: "border.default",
								px: "3",
								py: "2",
								fontSize: "text-xs",
								color: "text.muted",
							})}
						>
							After-body strip — status / quick actions
						</div>
					) : null
				}
			>
				<div className={css({ display: "grid", gap: "2", p: "3" })}>
					<p
						className={css({
							margin: "0",
							fontSize: "text-xs",
							color: "text.muted",
						})}
					>
						CEP DialogShell surface (the actual CEP `Shell` is
						storybook-incompatible due to the file-drop plugin chain; this stub
						mirrors the shell frame).
					</p>
					{Array.from({ length: 6 }).map((_, i) => (
						<div
							key={`row-${i}`}
							className={css({
								borderRadius: "shell-sm",
								borderWidth: "1px",
								borderStyle: "solid",
								borderColor: "border.default",
								bg: "surface.widget",
								px: "3",
								py: "2",
								fontSize: "text-xs",
								color: "text.primary",
							})}
						>
							Section {i + 1}
						</div>
					))}
				</div>
			</WorkspaceShell>
		</div>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const WithFooter: Story = {
	args: { withFooter: true },
};

export const WithAfterBody: Story = {
	args: { withAfterBody: true },
};

export const WithModifier: Story = {
	args: { modifier: "wsd-root--shell-flush" },
};

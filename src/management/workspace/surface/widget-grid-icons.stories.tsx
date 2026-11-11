import type { Meta, StoryObj } from "@storybook/react";
import { css } from "@/styled-system/css";

import {
	AlignIcon,
	LockIcon,
	MenuIcon,
	SearchIcon,
	TargetIcon,
	UnlockIcon,
} from "./widget-grid-icons";

type Args = {
	size: number;
};

const baseArgs: Args = {
	size: 20,
};

const renderTopIcons = (args: Args) => (
	<div
		className={css({
			display: "flex",
			flexWrap: "wrap",
			alignItems: "center",
			gap: "4",
			p: "4",
			color: "text.primary",
		})}
	>
		<div
			className={css({
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				gap: "1",
			})}
		>
			<SearchIcon size={args.size} />
			<span className={css({ fontSize: "text-2xs", color: "text.muted" })}>
				search
			</span>
		</div>
		<div
			className={css({
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				gap: "1",
			})}
		>
			<LockIcon size={args.size} />
			<span className={css({ fontSize: "text-2xs", color: "text.muted" })}>
				lock
			</span>
		</div>
		<div
			className={css({
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				gap: "1",
			})}
		>
			<UnlockIcon size={args.size} />
			<span className={css({ fontSize: "text-2xs", color: "text.muted" })}>
				unlock
			</span>
		</div>
		<div
			className={css({
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				gap: "1",
			})}
		>
			<MenuIcon size={args.size} />
			<span className={css({ fontSize: "text-2xs", color: "text.muted" })}>
				menu
			</span>
		</div>
	</div>
);

const meta = {
	title: "Workspace/WidgetGridIcons",
	args: baseArgs,
	argTypes: {
		size: { control: { type: "range", min: 12, max: 48, step: 2 } },
	},
	decorators: [
		(Story) => (
			<div
				className={css({
					display: "flex",
					flexWrap: "wrap",
					alignItems: "center",
					gap: "4",
					p: "4",
					color: "text.primary",
				})}
			>
				<Story />
			</div>
		),
	],
	render: renderTopIcons,
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const Large: Story = {
	args: { size: 32 },
};

export const Targets: Story = {
	render: () => (
		<div
			className={css({
				display: "flex",
				flexWrap: "wrap",
				alignItems: "center",
				gap: "4",
				p: "4",
				color: "text.primary",
			})}
		>
			<div
				className={css({
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					gap: "1",
				})}
			>
				<TargetIcon name="selection" />
				<span className={css({ fontSize: "text-2xs", color: "text.muted" })}>
					selection
				</span>
			</div>
			<div
				className={css({
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					gap: "1",
				})}
			>
				<TargetIcon name="comp" />
				<span className={css({ fontSize: "text-2xs", color: "text.muted" })}>
					comp
				</span>
			</div>
			<div
				className={css({
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					gap: "1",
				})}
			>
				<TargetIcon name="key-object" />
				<span className={css({ fontSize: "text-2xs", color: "text.muted" })}>
					key-object
				</span>
			</div>
			<div
				className={css({
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					gap: "1",
				})}
			>
				<TargetIcon name="time" />
				<span className={css({ fontSize: "text-2xs", color: "text.muted" })}>
					time
				</span>
			</div>
		</div>
	),
};

export const AlignIcons: Story = {
	render: () => {
		const names = [
			"align-left",
			"align-center-h",
			"align-right",
			"align-top",
			"align-center-v",
			"align-bottom",
			"distribute-h",
			"distribute-v",
			"align-start",
			"align-end",
		];
		return (
			<div
				className={css({
					display: "grid",
					gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
					gap: "3",
					p: "4",
					color: "text.primary",
				})}
			>
				{names.map((name) => (
					<div
						key={name}
						className={css({
							display: "flex",
							flexDirection: "column",
							alignItems: "center",
							gap: "1",
						})}
					>
						<AlignIcon name={name} />
						<span
							className={css({ fontSize: "text-2xs", color: "text.muted" })}
						>
							{name}
						</span>
					</div>
				))}
			</div>
		);
	},
};

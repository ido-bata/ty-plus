import type { Meta, StoryObj } from "@storybook/react";
import { css } from "@/styled-system/css";

import { AlignIcon, TargetIcon } from "./widget-grid-icons";

type Args = {
	size: number;
};

const baseArgs: Args = {
	size: 20,
};

const meta = {
	title: "Workspace/WidgetGridIcons",
	args: baseArgs,
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
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {
	render: () => <AlignIcon name="align-left" />,
};

export const Large: Story = {
	render: () => <AlignIcon name="align-left" />,
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

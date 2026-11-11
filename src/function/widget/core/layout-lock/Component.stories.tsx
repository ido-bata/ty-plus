import type { Meta, StoryObj } from "@storybook/react";

import { LayoutLockWidget } from "@/function/widget/core/layout-lock/Component";
import type { SurfaceState } from "@/management/workspace/state";
import { createInitialSurfaceState } from "@/management/workspace/state";
import { css } from "@/styled-system/css";

type Args = {
	layoutLocked: boolean;
};

const baseArgs: Args = {
	layoutLocked: false,
};

const buildState = (args: Args): SurfaceState => {
	const base = createInitialSurfaceState({ mode: "live" });
	return { ...base, layoutLocked: args.layoutLocked };
};

const meta = {
	title: "WidgetCore/LayoutLock",
	args: baseArgs,
	argTypes: {
		layoutLocked: { control: "boolean" },
	},
	render: (args: Args) => (
		<div
			className={css({
				display: "flex",
				height: "24",
				width: "24",
				alignItems: "center",
				justifyContent: "center",
				padding: "3",
			})}
		>
			<LayoutLockWidget state={buildState(args)} />
		</div>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Unlocked: Story = {};

export const Locked: Story = {
	args: { layoutLocked: true },
};

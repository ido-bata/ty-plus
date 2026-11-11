import type { Meta, StoryObj } from "@storybook/react";

import { Align } from "@/function/widget/core/align/Component";
import type { SurfaceState } from "@/management/workspace/state";
import { createInitialSurfaceState } from "@/management/workspace/state";
import { css } from "@/styled-system/css";

type Args = {
	widthPx: number;
	heightPx: number;
	selectionCount: number;
};

const buildState = (args: Args): SurfaceState => {
	const base = createInitialSurfaceState({ mode: "live" });
	// selectionCount is only used by the host call; the local widget state
	// initializes to 0 and refreshes via `host("getSelectionCount")`, which
	// in Storybook returns the noop caller's empty object. We can't
	// override that from here without mocking the runtime context.
	void args.selectionCount;
	return base;
};

const baseArgs: Args = {
	widthPx: 240,
	heightPx: 240,
	selectionCount: 0,
};

const meta = {
	title: "WidgetCore/Align",
	args: baseArgs,
	argTypes: {
		widthPx: { control: { type: "number", min: 120, max: 480 } },
		heightPx: { control: { type: "number", min: 120, max: 480 } },
		selectionCount: { control: { type: "number", min: 0, max: 16 } },
	},
	render: (args: Args) => (
		<div
			className={css({ padding: "3" })}
			style={{ width: args.widthPx, height: args.heightPx }}
		>
			<Align
				state={buildState(args)}
				widthPx={args.widthPx}
				widgetInstanceId="align-storybook-1"
			/>
		</div>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const Compact: Story = {
	args: { widthPx: 160, heightPx: 160 },
};

import type { Meta, StoryObj } from "@storybook/react";
import { type JSX, useRef, useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import { css } from "@/styled-system/css";

import { AnchoredPopover } from "./AnchoredPopover";

/**
 * Anchored popover primitive (Issue #610).
 *
 * The popover portals to `document.body` and positions itself against
 * the anchor's viewport rect — flip/clamp logic lives in the component,
 * surface styling is the consumer's `className`. Stories render a small
 * anchor button plus a styled popover surface; `SnapshotsOpen`-style
 * dismissal is covered by the StatusBar story that consumes it.
 */

const surface = css({
	borderRadius: "shell",
	borderWidth: "hairline",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.dialog",
	boxShadow: "lg",
	padding: "2",
	fontSize: "shell-sm",
	color: "text.primary",
});

const row = css({
	display: "flex",
	alignItems: "center",
	gap: "2",
	paddingInline: "2",
	paddingBlock: "1",
	borderRadius: "shell-sm",
	_hover: { backgroundColor: "interactive.hover" },
});

const anchorStyle = css({
	display: "inline-flex",
	height: "8",
	alignItems: "center",
	paddingInline: "3",
	borderRadius: "shell",
	borderWidth: "hairline",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.panel",
	color: "text.primary",
	fontSize: "shell-sm",
});

function PopoverHarness(props: {
	open: boolean;
	align?: "start" | "end";
	matchAnchorWidth?: boolean;
}): JSX.Element {
	const anchorRef = useRef<HTMLButtonElement | null>(null);
	const [open, setOpen] = useState(props.open);
	return (
		<div
			className={css({
				display: "flex",
				flexDirection: "column",
				alignItems: "flex-end",
				gap: "4",
				padding: "8",
			})}
		>
			<button
				ref={anchorRef}
				type="button"
				className={anchorStyle}
				onClick={() => setOpen((v) => !v)}
			>
				Anchor trigger
			</button>
			<AnchoredPopover
				open={open}
				onClose={() => setOpen(false)}
				anchorRef={anchorRef}
				align={props.align}
				matchAnchorWidth={props.matchAnchorWidth}
				className={surface}
			>
				<div className={row}>First option</div>
				<div className={row}>Second option</div>
				<div className={row}>Third option</div>
			</AnchoredPopover>
		</div>
	);
}

const meta = {
	title: "Shared/Interaction/AnchoredPopover",
	args: {
		open: true,
		align: "start" as const,
		matchAnchorWidth: false,
	},
	argTypes: {
		align: { control: { type: "select" }, options: ["start", "end"] },
		matchAnchorWidth: { control: "boolean" },
		open: { control: "boolean" },
	},
	render: (args): JSX.Element => (
		<PopoverHarness
			open={args.open}
			align={args.align}
			matchAnchorWidth={args.matchAnchorWidth}
		/>
	),
} satisfies Meta<{
	open: boolean;
	align?: "start" | "end";
	matchAnchorWidth?: boolean;
}>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Open below the anchor, start-aligned (default placement). */
export const Open: Story = {};

/** End-aligned against the anchor's right edge. */
export const EndAligned: Story = {
	args: { align: "end" },
};

/** Popover width locked to the anchor width. */
export const MatchAnchorWidth: Story = {
	args: { matchAnchorWidth: true },
};

/** Closed — renders nothing; the anchor click path is covered by ToggleOpens. */
export const Closed: Story = {
	args: { open: false },
	play: async () => {
		// The popover portals to document.body, so a closed story must not
		// render any of its rows anywhere in the document.
		await expect(
			within(document.body).queryByText("First option"),
		).not.toBeInTheDocument();
	},
};

/** Clicking the anchor toggles the popover open (portaled to body). */
export const ToggleOpens: Story = {
	args: { open: false },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByText("Anchor trigger"));
		// Portaled to document.body.
		await expect(within(document.body).getByText("First option")).toBeVisible();
	},
};

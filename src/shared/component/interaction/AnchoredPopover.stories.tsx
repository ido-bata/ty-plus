import type { Meta, StoryObj } from "@storybook/react";
import { type JSX, useRef, useState } from "react";
import { css } from "@/styled-system/css";
import { AnchoredPopover } from "./AnchoredPopover";

const clipHostClass = css({
	width: "16rem",
	height: "10rem",
	overflow: "hidden",
	borderRadius: "shell-sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.panel",
	padding: "2",
});

const anchorBtnClass = css({
	borderRadius: "shell-sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.widget",
	paddingInline: "2",
	paddingBlock: "1",
	fontSize: "shell-text-sm",
	color: "text.primary",
});

const popoverSurfaceClass = css({
	borderRadius: "shell-sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.dialog",
	padding: "2",
	boxShadow: "lg",
});

/**
 * The popover is rendered inside an `overflow: hidden` clipped host. Because
 * `AnchoredPopover` portals to `document.body` and positions with fixed
 * coordinates, it escapes the clip instead of being truncated.
 */
function ClippedHostDemo(): JSX.Element {
	const anchorRef = useRef<HTMLDivElement | null>(null);
	const [open, setOpen] = useState(false);
	return (
		<div className={clipHostClass}>
			<div ref={anchorRef}>
				<button
					type="button"
					className={anchorBtnClass}
					onClick={() => setOpen((o) => !o)}
				>
					Open popover
				</button>
			</div>
			<AnchoredPopover
				open={open}
				onClose={() => setOpen(false)}
				anchorRef={anchorRef}
				className={popoverSurfaceClass}
			>
				<div style={{ width: "14rem" }}>
					Popover content escapes the overflow-hidden ancestor.
				</div>
			</AnchoredPopover>
		</div>
	);
}

const meta = {
	title: "Shared/Interaction/AnchoredPopover",
	parameters: { layout: "centered" },
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const InsideOverflowHidden: Story = {
	render: () => <ClippedHostDemo />,
};

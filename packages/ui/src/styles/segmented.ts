import { css } from "@/styled-system/css";

/**
 * The look of a segmented strip: a row of buttons where one carries the
 * selected surface.
 *
 * The strip itself is not here, because it is two different controls: a
 * toolbar of toggles (`SegmentedControl`) and a real tablist. What they share
 * is how a segment looks, and that is what drifts when each writes it out.
 */

export const segmentedStripClass = css({
	display: "inline-flex",
	width: "full",
	minWidth: 0,
	maxWidth: "full",
	flexWrap: "wrap",
	gap: "1",
	borderRadius: "shell-sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.control",
	backgroundColor: "surface.panel",
	padding: "0.5",
});

export const segmentedButtonClass = css({
	height: "7",
	minWidth: 0,
	flex: 1,
	borderRadius: "shell-sm",
	paddingInline: "2",
	fontSize: "shell-text-sm",
	lineHeight: "tight",
	transitionProperty: "colors",
});

export const segmentedButtonQuietClass = css({
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "transparent",
});

export const segmentedButtonActiveClass = css({
	backgroundColor: "text.accent",
	color: "surface.panel",
	boxShadow: "sm",
});

export const segmentedButtonInactiveClass = css({
	backgroundColor: "surface.widget",
	color: "text.muted",
	_hover: {
		backgroundColor: "interactive.hover",
		color: "text.primary",
	},
});

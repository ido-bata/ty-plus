import { css } from "@/styled-system/css";

/**
 * The look of a segmented strip: a row of buttons where one carries the
 * selected surface.
 *
 * The strip itself is not here, because it is two different controls: a
 * toolbar of toggles (`SegmentedControl`) and a real tablist. What they share
 * is how a segment looks, and that is what drifts when each writes it out.
 */

/**
 * Chrome shared by the visible strip and the off-screen measurement strips
 * `SegmentedControl` renders to decide whether full or compact labels fit.
 * Keep the box metrics (display, gap, padding, border) identical between the
 * two or the fit measurement drifts from the real layout.
 */
const stripChrome = {
	display: "inline-flex",
	minWidth: 0,
	flexWrap: "nowrap",
	gap: "1",
	borderRadius: "shell-sm",
	borderWidth: "hairline",
	borderStyle: "solid",
	borderColor: "border.control",
	backgroundColor: "surface.panel",
	padding: "0.5",
} as const;

export const segmentedStripClass = css({
	...stripChrome,
	width: "full",
	maxWidth: "full",
	// Segmented strips never wrap to a second row (issue #723). When the
	// labels — full or compact — still exceed the available width the strip
	// scrolls horizontally instead of clipping a segment or reflowing.
	overflowX: "auto",
	overscrollBehaviorX: "contain",
});

/**
 * Off-screen twin of `segmentedStripClass` used only for width measurement.
 * `width: max-content` lets it report the intrinsic width the full (or
 * compact) labels need; `visibility: hidden` keeps it out of the paint and
 * accessibility trees while preserving layout.
 */
export const segmentedMeasureStripClass = css({
	...stripChrome,
	position: "absolute",
	visibility: "hidden",
	pointerEvents: "none",
	width: "max-content",
	maxWidth: "none",
	overflow: "hidden",
});

/**
 * Zero-size clip host for the measurement strips. Without it an absolutely
 * positioned `max-content` strip wider than the viewport would extend the
 * document's scrollable overflow area.
 */
export const segmentedMeasureHostClass = css({
	position: "absolute",
	width: "0",
	maxWidth: "0",
	height: "0",
	overflow: "hidden",
	visibility: "hidden",
	pointerEvents: "none",
});

export const segmentedButtonClass = css({
	height: "7",
	// `max-content`, not 0: with `minWidth: 0` + `flex: 1` a crowded strip
	// (e.g. the debug console's 11 source filters) shrank every segment below
	// its label width and clipped the text.  Content-sized minimums keep each
	// segment legible; the strip's `overflow-x: auto` scrolls the excess
	// instead of wrapping rows (issue #723).
	minWidth: "max-content",
	flex: 1,
	// Labels are single-line by contract — a wrapping translation must grow
	// the strip (and scroll), never stack a second line inside a segment.
	whiteSpace: "nowrap",
	borderRadius: "shell-sm",
	paddingInline: "2",
	fontSize: "shell-text-sm",
	lineHeight: "tight",
	transitionProperty: "colors",
});

/**
 * Vertical variant of `segmentedButtonClass` for sidebars and stacked lists.
 * The horizontal strip shares a fixed height via `flex: 1`; inside a column
 * that collapses each row to a fraction of the label height, so rows here
 * fill the width and size to their content instead.
 */
export const segmentedColumnButtonClass = css({
	height: "auto",
	width: "full",
	minWidth: 0,
	flex: "none",
	borderRadius: "shell-sm",
	paddingBlock: "1.5",
	paddingInline: "2",
	fontSize: "shell-text-sm",
	lineHeight: "tight",
	textAlign: "start",
	transitionProperty: "colors",
});

export const segmentedButtonQuietClass = css({
	borderWidth: "hairline",
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

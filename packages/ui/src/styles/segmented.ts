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
	// Issue #722: the strip is passive chrome — its resting border stays on
	// the non-assertive `border.subtle` tier; `border.control` is reserved
	// for controls that must stay identifiable unfocused (text fields).
	borderColor: "border.subtle",
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
	// Issue #764: the global scrollbar chrome hides thumbs until hover
	// (`*:hover::-webkit-scrollbar-thumb` in panda.config.ts), so an
	// overflowing strip showed edge-clipped labels with no rest-state
	// scroll affordance. Filter strips are narrow chrome where overflow
	// must be discoverable at rest, so the thumb stays visible. It only
	// paints while the strip actually overflows — `overflow-x: auto`
	// renders no scrollbar otherwise.
	//
	// Issue #796: the 4px muted thumb still read as "no scroll cue" in
	// the debug-console captures — the right edge clipped a label with
	// nothing visibly scrollable. Give the strip's horizontal scrollbar
	// a taller track (6px) so the affordance survives downscaled
	// captures and low-contrast panels.
	"&::-webkit-scrollbar": {
		height: "6px",
	},
	"&::-webkit-scrollbar-track": {
		background: "var(--color-surface-widget)",
	},
	"&::-webkit-scrollbar-thumb": {
		visibility: "visible",
		transition: "none",
	},
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
	transitionProperty: "color, background-color, border-color",
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
	transitionProperty: "color, background-color, border-color",
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

import { css, cva } from "@/styled-system/css";

/**
 * Layout recipes — the site's shared coordinate system.
 *
 * LP layout is a web-side responsibility (see DESIGN-BRIEF #302): these
 * recipes own page geometry only — containers, gutters, section rhythm,
 * and grid primitives. Control appearance stays in @ty-plus/ui and all
 * color/typography values resolve to shared tokens.
 *
 * Coordinate system:
 *   - One outer container per page band, sized narrow / content / wide.
 *   - A 12-column grid inside content/wide containers; sections compose
 *     asymmetric spans instead of inventing their own max-widths.
 *   - Sections own vertical rhythm; pages never hand-roll paddingBlock.
 */

/**
 * Container — single source of truth for content width + gutter.
 *   narrow:  48rem — long-form reading (docs prose)
 *   content: 72rem — default page width
 *   wide:    90rem — hero / showcase bands with breathing room
 */
export const container = cva({
	base: {
		width: "100%",
		marginInline: "auto",
		paddingInline: { base: "1.25rem", md: "2rem", lg: "2.5rem" },
	},
	variants: {
		size: {
			narrow: { maxWidth: "48rem" },
			content: { maxWidth: "72rem" },
			wide: { maxWidth: "90rem" },
		},
	},
	defaultVariants: { size: "content" },
});

/**
 * Section — a top-level page band with its own vertical rhythm.
 *   flow:   generous band for hero/showcase (py 4rem→7rem)
 *   band:   standard content section (py 3rem→5rem)
 *   prose:  compact reading section (py 2.5rem→3.5rem)
 *   flush:  no vertical padding, for grids that manage their own gaps
 */
export const section = cva({
	base: { display: "flex", flexDirection: "column" },
	variants: {
		variant: {
			flow: {
				gap: { base: "2rem", md: "3rem" },
				paddingBlock: { base: "4rem", md: "7rem" },
			},
			band: {
				gap: { base: "1.5rem", md: "2.5rem" },
				paddingBlock: { base: "3rem", md: "5rem" },
			},
			prose: {
				gap: { base: "1rem", md: "1.5rem" },
				paddingBlock: { base: "2.5rem", md: "3.5rem" },
			},
			flush: { gap: "1.5rem", paddingBlock: 0 },
		},
	},
	defaultVariants: { variant: "band" },
});

/**
 * Grid — 12-column coordinate system. Mobile collapses to one column.
 * `cols` switches to a smaller symmetric grid for card rows.
 */
export const grid = cva({
	base: {
		display: "grid",
		width: "100%",
		gap: { base: "1.25rem", md: "2rem" },
		gridTemplateColumns: { base: "1fr", md: "repeat(12, minmax(0, 1fr))" },
	},
	variants: {
		cols: {
			2: {
				gridTemplateColumns: { base: "1fr", md: "repeat(2, minmax(0, 1fr))" },
			},
			3: {
				gridTemplateColumns: { base: "1fr", md: "repeat(3, minmax(0, 1fr))" },
			},
			4: {
				gridTemplateColumns: { base: "1fr", md: "repeat(4, minmax(0, 1fr))" },
			},
		},
		gap: {
			1: { gap: "0.75rem" },
			2: { gap: "1.25rem" },
			3: { gap: "1.75rem" },
		},
	},
	defaultVariants: { gap: 2 },
});

/**
 * Stack — vertical rhythm inside a section or grid cell.
 */
export const stack = cva({
	base: { display: "flex", flexDirection: "column" },
	variants: {
		gap: {
			1: { gap: "0.5rem" },
			2: { gap: "0.75rem" },
			3: { gap: "1.25rem" },
			4: { gap: "1.75rem" },
			6: { gap: "2.5rem" },
		},
		align: {
			start: { alignItems: "flex-start" },
			center: { alignItems: "center", textAlign: "center" },
			stretch: { alignItems: "stretch" },
		},
	},
	defaultVariants: { gap: 3, align: "start" },
});

/**
 * Cluster — wrapping horizontal row for CTAs, meta lines, link groups.
 */
export const cluster = cva({
	base: { display: "flex", flexWrap: "wrap", alignItems: "center" },
	variants: {
		gap: {
			1: { gap: "0.5rem" },
			2: { gap: "0.75rem" },
			3: { gap: "1.25rem" },
			4: { gap: "1.75rem" },
		},
		justify: {
			start: { justifyContent: "flex-start" },
			center: { justifyContent: "center" },
			between: { justifyContent: "space-between" },
		},
	},
	defaultVariants: { gap: 3, justify: "start" },
});

/**
 * Column spans on the 12-column grid. Compose with `grid()`:
 *   <div className={grid()}>
 *     <div className={span5}>…</div>
 *     <div className={span7}>…</div>
 *   </div>
 * On mobile every span collapses to full width. These must stay literal
 * css() objects — Panda's static extraction cannot see values returned
 * from helper functions.
 */
export const span3 = css({
	minWidth: 0,
	gridColumn: { base: "1 / -1", md: "span 3" },
});
export const span4 = css({
	minWidth: 0,
	gridColumn: { base: "1 / -1", md: "span 4" },
});
export const span5 = css({
	minWidth: 0,
	gridColumn: { base: "1 / -1", md: "span 5" },
});
export const span7 = css({
	minWidth: 0,
	gridColumn: { base: "1 / -1", md: "span 7" },
});
export const span8 = css({
	minWidth: 0,
	gridColumn: { base: "1 / -1", md: "span 8" },
});
export const span9 = css({
	minWidth: 0,
	gridColumn: { base: "1 / -1", md: "span 9" },
});

/**
 * Breakout — let a child exceed the container's content box up to the
 * viewport edge. Use sparingly for media that should feel edge-to-edge
 * inside a narrow column.
 */
export const breakout = css({
	width: "100vw",
	marginInline: "calc(50% - 50vw)",
	maxWidth: "100vw",
});

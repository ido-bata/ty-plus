import { css } from "@/styled-system/css";

/**
 * Site layout recipes — composition only. Every visual property resolves
 * to shared --ty-* tokens or Panda semantic tokens; control appearance
 * (buttons, badges, notices, surfaces, media frames) comes from
 * @ty-plus/ui components.
 */

export const h1 = css({
	fontSize: "text-display-lg",
	fontWeight: "semibold",
	lineHeight: "tight",
	letterSpacing: "tighter",
	margin: 0,
});

export const h2 = css({
	fontSize: "text-display-md",
	fontWeight: "semibold",
	lineHeight: "tight",
	letterSpacing: "tight",
	margin: 0,
});

export const h3 = css({
	fontSize: "text-body",
	fontWeight: "semibold",
	margin: 0,
});

export const lead = css({
	fontSize: "text-lead",
	color: "text.muted",
	maxWidth: "42rem",
	margin: 0,
});

export const body = css({
	color: "text.muted",
	margin: 0,
});

export const link = css({
	display: "inline-block",
	paddingBlock: "0.25rem",
	marginBlock: "-0.25rem",
	color: "text.primary",
	textDecoration: "underline",
	textUnderlineOffset: "2px",
	textDecorationColor: "border.strong",
	_hover: { textDecorationColor: "text.accent" },
});

export const figure = css({
	margin: 0,
	display: "flex",
	flexDirection: "column",
	gap: "0.625rem",
});

export const figcaption = css({
	fontSize: "xs",
	color: "text.muted",
});

export const shotImg = css({
	display: "block",
	width: "100%",
	height: "auto",
});

export const defList = css({
	display: "flex",
	flexDirection: "column",
	margin: 0,
});

export const defRow = css({
	display: "grid",
	gridTemplateColumns: { base: "1fr", sm: "16rem 1fr" },
	gap: { base: "0.25rem", sm: "1.5rem" },
	paddingBlock: "1rem",
	borderTopWidth: "hairline",
	borderTopStyle: "solid",
	borderTopColor: "border.subtle",
	"&:last-child": {
		borderBottomWidth: "hairline",
		borderBottomStyle: "solid",
		borderBottomColor: "border.subtle",
	},
});

export const defTerm = css({
	fontWeight: "medium",
	margin: 0,
	// Standalone term links get a ≥24px tap target without changing the
	// row's visual rhythm.
	"& a": {
		display: "inline-block",
		paddingBlock: "0.375rem",
		marginBlock: "-0.375rem",
	},
});
export const defDesc = css({ color: "text.muted", margin: 0 });

export const steps = css({
	margin: 0,
	paddingInlineStart: "1.25rem",
	listStyleType: "decimal",
	color: "text.muted",
	// Flex/grid parents suppress ::marker, so keep the list block-level and
	// space items with a sibling margin instead.
	"& > li + li": { marginBlockStart: "0.75rem" },
});

export const bulletList = css({
	margin: 0,
	paddingInlineStart: "1.25rem",
	listStyleType: "disc",
	color: "text.muted",
	"& > li + li": { marginBlockStart: "0.375rem" },
});

export const releaseList = css({
	listStyle: "none",
	margin: 0,
	padding: 0,
	display: "flex",
	flexDirection: "column",
});

export const releaseItem = css({
	display: "flex",
	flexDirection: "column",
	gap: "0.5rem",
	paddingBlock: "1.25rem",
	borderTopWidth: "hairline",
	borderTopStyle: "solid",
	borderTopColor: "border.subtle",
});

export const releaseHead = css({
	display: "flex",
	alignItems: "baseline",
	gap: "0.75rem",
	flexWrap: "wrap",
});

export const releaseVersion = css({
	display: "inline-block",
	paddingBlock: "0.375rem",
	marginBlock: "-0.375rem",
	fontFamily: "mono",
	fontSize: "text-md",
	fontWeight: "medium",
	color: "text.primary",
	textDecoration: "none",
	_hover: { color: "text.accent" },
});

export const releaseMeta = css({
	display: "flex",
	alignItems: "center",
	gap: "0.75rem",
	flexWrap: "wrap",
	fontSize: "xs",
	color: "text.muted",
});

export const muted = css({ color: "text.muted" });

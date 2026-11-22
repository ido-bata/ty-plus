import { css } from "@/styled-system/css";

/**
 * Shared type treatments.
 *
 * These are the recurring typographic identities of the app — the label that
 * names a section, the label that names a row. They used to be written out
 * in every surface that needed them, which is how one "section label" ended
 * up in two sizes across eleven files: eight of them used Panda's default
 * `xs` (12px) and three used the app's own `text-xs` (10px), and nothing
 * said they were supposed to be the same thing.
 *
 * A treatment that more than one surface uses belongs here, so that the
 * treatment and its name are decided once.
 */

/**
 * The uppercase, wide-tracked, muted label that names a section of a form,
 * a panel or a dialog.
 */
export const sectionLabelClass = css({
	color: "text.muted",
	fontSize: "text-xs",
	fontWeight: "medium",
	letterSpacing: "wide",
	textTransform: "uppercase",
});

/**
 * The primary label of a row — the entry's own name.
 */
export const rowLabelClass = css({
	color: "text.primary",
	fontSize: "shell-text-sm",
	fontWeight: "medium",
	lineHeight: "tight",
	textAlign: "left",
});

/**
 * The label of a field — the name of the setting, the name of the row.
 */
export const fieldLabelClass = css({
	fontSize: "text-xs",
	fontWeight: "medium",
	color: "text.primary",
});

/**
 * The helper text under a field.
 */
export const fieldDescriptionClass = css({
	marginTop: "1",
	fontSize: "text-xs",
	color: "text.muted",
});

/**
 * Content that is available to assistive technology but not shown. A focus
 * ring and a legend both need it, and writing it out twice means the two
 * copies drift.
 */
export const srOnlyClass = css({
	position: "absolute",
	width: "1px",
	height: "1px",
	padding: "0",
	margin: "-1px",
	overflow: "hidden",
	clip: "rect(0,0,0,0)",
	whiteSpace: "nowrap",
	borderWidth: "0",
});

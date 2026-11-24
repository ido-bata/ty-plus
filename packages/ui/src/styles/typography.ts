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
 * The title of a section or a step — the semibold line under a
 * `sectionLabelClass`.
 */
export const sectionTitleClass = css({
	color: "text.primary",
	fontSize: "shell-text-sm",
	fontWeight: "semibold",
});

/**
 * The primary title of a screen, a dialog or a rendered document — the
 * largest heading step.
 */
export const heading1Class = css({
	color: "text.primary",
	fontSize: "lg",
	fontWeight: "semibold",
});

/**
 * The small semibold title — a dialog header, a panel header, a rendered
 * third-level heading.
 */
export const heading3Class = css({
	color: "text.primary",
	fontSize: "sm",
	fontWeight: "semibold",
});

/**
 * The title of a list item — truncates rather than wraps.
 */
export const listItemTitleClass = css({
	color: "text.primary",
	fontSize: "sm",
	fontWeight: "medium",
});

/**
 * The title of a card or an expandable section.
 */
export const cardTitleClass = css({
	color: "text.primary",
	fontSize: "text-sm",
	fontWeight: "medium",
});

/**
 * The primary line of a row — truncates with an ellipsis.
 */
export const rowTitleClass = css({
	overflow: "hidden",
	textOverflow: "ellipsis",
	whiteSpace: "nowrap",
	color: "text.primary",
	fontSize: "shell-text-sm",
	fontWeight: "medium",
});

/**
 * The secondary line of a row — truncates with an ellipsis.
 */
export const rowMetaClass = css({
	overflow: "hidden",
	textOverflow: "ellipsis",
	whiteSpace: "nowrap",
	color: "text.muted",
	fontSize: "xs",
});

/**
 * The description under a step or section title.
 */
export const stepDescriptionClass = css({
	color: "text.muted",
	fontSize: "text-xs",
	lineHeight: "tight",
});

/**
 * Muted body text that keeps its own line breaks.
 */
export const mutedBodyTextClass = css({
	color: "text.muted",
	fontSize: "sm",
	whiteSpace: "pre-line",
});

/**
 * Monospaced micro text — font names, console prompts, file paths at meta
 * scale.
 */
export const monoMetaClass = css({
	color: "text.muted",
	fontFamily: "mono",
	fontSize: "text-2xs",
});

/**
 * A numeric count or tally — tabular figures so digits do not jitter.
 */
export const countLabelClass = css({
	color: "text.muted",
	fontSize: "text-2xs",
	fontVariantNumeric: "tabular-nums",
});

/**
 * Text clamped to two lines and de-emphasized — error digests, missing
 * content notices.
 */
export const clampedTextClass = css({
	lineClamp: 2,
	overflow: "hidden",
	wordBreak: "break-all",
	opacity: "0.8",
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

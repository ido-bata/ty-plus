/**
 * Dialog footer shell primitives.
 *
 * The canonical dialog footer uses `Footer` + `DialogFooterActions` +
 * `Button` (from `@ty-plus/ui/controls/Button`). All in-app dialogs
 * must render their action row through `DialogFooterActions`; do not author
 * ad-hoc `flex justify-end` or `grid grid-cols-N` rows.
 *
 * Slot order in the action row (left → right):
 *
 *   1 button  : [Primary]
 *   2 buttons : [Cancel] [Primary]
 *   3 buttons : [Secondary] [Cancel] [Primary]
 *
 * Tone policy for `Button.variant`:
 *
 *   Cancel           → `ghost`
 *   Secondary reset  → `default`
 *   Primary confirm  → `primary`
 *   Destructive      → `danger` (always paired with a leading icon)
 *
 * Icon policy: only destructive actions carry a leading icon. Cancel,
 * secondary and primary buttons render text only. All buttons must set
 * `fullWidth` so the grid stretches them to equal columns.
 *
 * 4+ action buttons are forbidden — split into an overflow menu.
 *
 * The action group is compact and right-anchored: each implicit column
 * is capped at 10rem, so three actions occupy ~30rem regardless of the
 * dialog width instead of stretching to equal thirds of a full-panel
 * dialog. `maxWidth: "100%"` lets the columns shrink proportionally on
 * narrow surfaces.
 *
 * The footer band owns the canonical horizontal inset
 * (`--ty-shell-pad-inline`), matching `Header` and `Content`, so footer
 * actions never sit flush against the dialog edge regardless of the
 * caller-supplied `footerClassName`.
 */

import { cx } from "@ty-plus/ui";
import type { JSX, ReactNode } from "react";
import { css } from "@/styled-system/css";

/** PandaCSS layout for the canonical dialog footer. */
const footerShell = css({
	display: "flex",
	width: "100%",
	alignItems: "center",
	justifyContent: "space-between",
	gap: "2",
	minHeight: "7",
	paddingInline: "var(--ty-shell-pad-inline)",
	fontSize: "xs",
	color: "text.muted",
	bg: "surface.dialog",
	flexShrink: 0,
});

/**
 * Equal-width action grid anchored to the footer's right edge. Implicit
 * columns are capped at 10rem so the group stays compact on wide
 * dialogs; `Button fullWidth` fills each cell. `marginInlineStart:
 * "auto"` keeps the group right-anchored even when the footer has no
 * leading status content (the shell's `space-between` would otherwise
 * park a lone group on the left).
 */
const footerActions = css({
	display: "grid",
	width: "max-content",
	maxWidth: "100%",
	marginInlineStart: "auto",
	gap: "2",
	gridAutoColumns: "minmax(0, 10rem)",
	gridAutoFlow: "column",
	justifyContent: "end",
});

export type FooterProps = {
	children: ReactNode;
	className?: string;
};

export function Footer({ children, className = "" }: FooterProps): JSX.Element {
	return (
		<footer className={cx(footerShell, className)} data-dialog-footer="">
			{children}
		</footer>
	);
}

export type DialogFooterActionsProps = {
	children: ReactNode;
	className?: string;
};

/**
 * Standard dialog footer action row. Renders an equal-width, right-anchored
 * grid; children are placed in the order the caller supplies them. All
 * children should be `Button` instances with `fullWidth`.
 */
export function DialogFooterActions({
	children,
	className,
}: DialogFooterActionsProps): JSX.Element {
	return (
		<div data-dialog-footer-actions="" className={cx(footerActions, className)}>
			{children}
		</div>
	);
}

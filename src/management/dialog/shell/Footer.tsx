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
 * The footer band owns the canonical horizontal inset
 * (`--ty-shell-pad-inline`), matching `Header` and `Content`, so footer
 * actions never sit flush against the dialog edge regardless of the
 * caller-supplied `footerClassName`.
 *
 * `DialogFooterActions` shrink-wraps its buttons (`width: fit-content`)
 * and anchors right via `margin-inline-start: auto`. It must NOT claim
 * `width: 100%`: as a flex item that basis starves any sibling status
 * label down to a sliver (forcing it to wrap) and stretches a lone
 * button across most of the dialog. Columns stay equal-width through
 * `minmax(min-content, 1fr)` so a long label can never be clipped below
 * its min-content size.
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
	// Issue #769: the band owns block padding too — without it the action
	// buttons sat flush against the dialog's top/bottom edges (0px block
	// spacing) while `Header` keeps `py: 2.5`.
	paddingBlock: "var(--ty-shell-space)",
	paddingInline: "var(--ty-shell-pad-inline)",
	fontSize: "xs",
	color: "text.muted",
	flexShrink: 0,
});

/**
 * Equal-width action grid that anchors right; `Button fullWidth` fills each
 * cell. Sized to content (`fit-content`) so a sibling status label keeps its
 * natural width and a single action never stretches across the dialog.
 */
const footerActions = css({
	display: "grid",
	flex: "0 0 auto",
	width: "fit-content",
	marginInlineStart: "auto",
	gap: "2",
	gridAutoColumns: "minmax(min-content, 1fr)",
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

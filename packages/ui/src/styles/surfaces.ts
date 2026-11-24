import { css, cx } from "@/styled-system/css";

/**
 * Shared surface and chrome treatments.
 *
 * The containers and inline notices that more than one surface draws the
 * same way — dialog bodies, list frames, empty states, status banners,
 * workspace tile layers. A treatment that two files write out by hand is
 * two treatments that will drift, so the ones with a shared identity live
 * here next to `typography.ts`.
 */

/**
 * A dialog body that runs edge to edge inside the shell — no gutter, dialog
 * surface color, column layout that clips overflow.
 */
export const dialogContentClass = css({
	display: "flex",
	minHeight: 0,
	minWidth: 0,
	flexDirection: "column",
	overflow: "hidden",
	paddingInline: "0",
	backgroundColor: "surface.dialog",
});

/**
 * The footer strip of a dialog — a top divider with shell-aligned padding.
 */
export const dialogFooterClass = css({
	borderTopWidth: "hairline",
	borderTopStyle: "solid",
	borderTopColor: "border.default",
	paddingInline: "var(--ty-shell-pad-inline)",
	paddingBlock: "var(--ty-shell-space)",
});

/**
 * The frame of an inline status banner — layout, border and type size. The
 * tone supplies the colors; pair it with `statusBannerClass`.
 */
export const statusBannerBaseClass = css({
	display: "flex",
	alignItems: "flex-start",
	gap: "2",
	borderRadius: "shell-sm",
	borderWidth: "hairline",
	borderStyle: "solid",
	padding: "2",
	fontSize: "text-xs",
});

const statusBannerTones = {
	success: css({
		borderColor: "status.success/30",
		backgroundColor: "status.success/10",
		color: "status.success",
	}),
	warning: css({
		borderColor: "status.warning/30",
		backgroundColor: "status.warning/10",
		color: "status.warning",
	}),
	error: css({
		borderColor: "status.error/30",
		backgroundColor: "status.error/10",
		color: "status.error",
	}),
} as const;

export type StatusBannerTone = keyof typeof statusBannerTones;

/**
 * A complete status banner class for the given tone.
 */
export function statusBannerClass(tone: StatusBannerTone): string {
	return cx(statusBannerBaseClass, statusBannerTones[tone]);
}

/**
 * The numbered badge of a wizard step.
 */
export const stepBadgeClass = css({
	display: "flex",
	height: "6",
	width: "6",
	flexShrink: 0,
	alignItems: "center",
	justifyContent: "center",
	borderRadius: "full",
	borderWidth: "hairline",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.widget",
	fontSize: "shell-text-sm",
	fontWeight: "bold",
	color: "text.primary",
});

/**
 * The card that holds one step of a wizard dialog.
 */
export const stepCardClass = css({
	display: "flex",
	width: "full",
	minWidth: 0,
	flexDirection: "column",
	gap: "3",
	borderRadius: "shell-sm",
	borderWidth: "hairline",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.widget",
	padding: "4",
});

/**
 * A monospaced preview box — generated code, paths, values at meta size.
 */
export const monoPreviewBoxClass = css({
	fontFamily: "mono",
	fontSize: "text-xs",
	color: "text.primary",
	overflowWrap: "break-all",
	borderRadius: "shell-sm",
	backgroundColor: "surface.widget",
	paddingInline: "2",
	paddingBlock: "1",
});

/**
 * A bordered `surface.widget` well that clips its content — preview boxes,
 * icon tiles, editor shells.
 */
export const widgetSurfaceClass = css({
	overflow: "hidden",
	borderRadius: "shell-sm",
	borderWidth: "hairline",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.widget",
});

/**
 * The empty state of a folder browser — a centered muted message inside a
 * bordered well.
 */
export const browserEmptyClass = css({
	display: "grid",
	minHeight: 0,
	flex: "1",
	placeItems: "center",
	borderRadius: "md",
	borderWidth: "hairline",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.widget",
	paddingInline: "3",
	textAlign: "center",
	fontSize: "shell-text-sm",
	color: "text.muted",
});

/**
 * A bordered column list — file lists, tree lists. Rows separate
 * themselves; the frame only clips and rounds.
 */
export const borderedListClass = css({
	display: "flex",
	flexDirection: "column",
	overflow: "hidden",
	borderRadius: "shell-sm",
	borderWidth: "hairline",
	borderStyle: "solid",
	borderColor: "border.default",
});

/**
 * A surface that fills its host edge to edge — widget roots, full-panel
 * consoles.
 */
export const fillSurfaceClass = css({
	display: "flex",
	height: "full",
	minHeight: 0,
	width: "full",
	minWidth: 0,
	flexDirection: "column",
	overflow: "hidden",
	backgroundColor: "surface.dialog",
});

/**
 * The clipped content layer inside a workspace tile or grid cell — sits
 * under the selection ring at z-index 0.
 */
export const tileInnerClass = css({
	position: "absolute",
	inset: "0",
	zIndex: "var(--ty-z-content)",
	minHeight: "0",
	minWidth: "0",
	overflow: "hidden",
	borderRadius: "shell-sm",
});

/**
 * The default (unselected) ring border of a workspace tile or grid cell.
 */
export const tileRingClass = css({
	borderWidth: "hairline",
	borderStyle: "solid",
	borderColor: "var(--color-ty-ws-gridcell-ring-border)",
});

/**
 * The centered muted message of an empty list.
 */
export const emptyStateClass = css({
	paddingBlock: "8",
	textAlign: "center",
	fontSize: "shell-text-sm",
	color: "text.muted",
});

/**
 * A label/value row — the term on the left, the value on the right.
 */
export const infoRowClass = css({
	display: "flex",
	justifyContent: "space-between",
	gap: "var(--ty-space-2)",
	fontSize: "text-xs",
});

/**
 * A muted icon centered in a full-size well — navigation glyphs, back
 * buttons, tile medallions.
 */
export const centeredIconClass = css({
	display: "flex",
	height: "full",
	width: "full",
	alignItems: "center",
	justifyContent: "center",
	color: "text.muted",
});

/**
 * The 20px icon-only action button of a dense row — run / edit / delete.
 * Raw `<button>` chrome; the shared `IconButton` does not have this size.
 */
export const iconActionButtonClass = css({
	display: "inline-flex",
	height: "5",
	width: "5",
	flexShrink: "0",
	alignItems: "center",
	justifyContent: "center",
	borderRadius: "shell-sm",
	borderWidth: "hairline",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.widget/50",
	color: "text.muted",
	_hover: {
		backgroundColor: "interactive.hover",
		color: "text.primary",
	},
});

import { cx, heading3Class } from "@ty-plus/ui";
import type { JSX, ReactNode } from "react";
import { css } from "@/styled-system/css";

export type WorkspaceShellProps = {
	rootModifierClasses?: readonly string[];
	dialogColumnClass?: string;
	title: string;
	meta: string;
	children: ReactNode;
	afterBody?: ReactNode;
	footer?: ReactNode;
};

/*
 * The legacy `wsd-*` classes had no stylesheet anywhere in the bundle, so
 * the shell rendered as unstyled blocks — the header stacked vertically
 * and modifier classes were pixel-noops.  The Panda classes below give the
 * frame the same shape as `DialogShell` (header row / scrolling body);
 * `wsd-*` names are kept as stable hooks for host-side selectors.
 */
const rootBaseClass = css({
	display: "flex",
	flexDirection: "column",
	height: "100%",
	maxHeight: "100%",
	minHeight: "0",
	width: "100%",
	overflow: "hidden",
	boxSizing: "border-box",
	bg: "surface.dialog",
});

const columnBaseClass = css({
	display: "flex",
	width: "100%",
	minWidth: "0",
	minHeight: "0",
	flex: "1",
	flexDirection: "column",
});

const headerClass = css({
	display: "flex",
	flexShrink: 0,
	alignItems: "center",
	justifyContent: "space-between",
	gap: "3",
	paddingBlock: "2.5",
	paddingInline: "var(--ty-shell-pad-inline)",
	bg: "surface.dialog",
});

const titleClass = css({
	margin: "0",
	minWidth: 0,
});

const headerEndClass = css({
	display: "flex",
	flexShrink: 0,
	alignItems: "center",
});

const metaClass = css({
	fontSize: "var(--ty-text-size-xs)",
	color: "text.muted",
	flexShrink: 0,
});

const mainScrollClass = css({
	flex: "1",
	minHeight: 0,
	overflow: "auto",
});

const bodyClass = css({
	paddingBlock: "3",
	paddingInline: "var(--ty-shell-pad-inline)",
});

const footerClass = css({
	display: "flex",
	flexShrink: 0,
	alignItems: "center",
	gap: "2",
	borderTopWidth: "1px",
	borderTopStyle: "solid",
	borderTopColor: "border.default",
	paddingBlock: "2",
	paddingInline: "var(--ty-shell-pad-inline)",
	fontSize: "var(--ty-text-size-xs)",
	color: "text.muted",
	bg: "surface.dialog",
});

export function WorkspaceShell({
	rootModifierClasses = [],
	dialogColumnClass,
	title,
	meta,
	children,
	afterBody,
	footer,
}: WorkspaceShellProps): JSX.Element {
	const mods: string[] = [];
	for (const c of rootModifierClasses) {
		const trimmed = c.trim();
		if (trimmed) mods.push(trimmed);
	}
	const rootClass = cx("wsd-root", "wsd-root--shell", rootBaseClass, ...mods);
	const columnClass = cx(
		"wsd-dialog-column",
		columnBaseClass,
		dialogColumnClass?.trim() || "",
	);
	return (
		<div className={rootClass}>
			<div className={columnClass}>
				<header className={cx("wsd-header", headerClass)}>
					<h1 className={cx("wsd-title", heading3Class, titleClass)}>
						{title}
					</h1>
					<div className={cx("wsd-header-end", headerEndClass)}>
						<span className={cx("wsd-meta", metaClass)}>{meta}</span>
					</div>
				</header>
				<div className={cx("wsd-main-scroll", mainScrollClass)}>
					<section className={cx("wsd-body", bodyClass)}>{children}</section>
					{afterBody}
				</div>
				{footer ? (
					<footer className={cx("wsd-footer", footerClass)}>{footer}</footer>
				) : null}
			</div>
		</div>
	);
}

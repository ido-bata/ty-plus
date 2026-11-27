import { cx } from "@ty-plus/ui";
import type { JSX, ReactNode } from "react";
import { css } from "@/styled-system/css";

/** PandaCSS layout for the canonical dialog content region. */
const contentShell = css({
	flex: "1",
	minHeight: "0",
	display: "flex",
	flexDirection: "column",
	gap: "3",
	overflowX: "hidden",
	overflowY: "auto",
	paddingInline: "var(--ty-shell-pad-inline)",
	WebkitOverflowScrolling: "touch",
	scrollbarGutter: "stable",
	scrollbarWidth: "thin",
	// The scrollbar thumb must be visible at rest — a fully transparent
	// thumb gives zero overflow affordance (issue #735). It shares the
	// workspace scrollbar tokens so dialogs and the workspace read the
	// same.
	scrollbarColor:
		"rgba(var(--text-r),var(--text-g),var(--text-b),var(--ty-opacity-ws-scrollbar-thumb-strong)) transparent",
	_hover: {
		scrollbarColor:
			"rgba(var(--text-r),var(--text-g),var(--text-b),0.4) transparent",
	},
});

export type ContentProps = {
	children: ReactNode;
	className?: string;
};

export function Content({
	children,
	className = "",
}: ContentProps): JSX.Element {
	return (
		<div className={cx(contentShell, className)} data-dialog-content="">
			{children}
		</div>
	);
}

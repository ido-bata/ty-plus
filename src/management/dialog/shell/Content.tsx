import type { JSX, ReactNode } from "react";
import { cx } from "@/shared/util/cx";
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
	bg: "surface.dialog",
	paddingInline: "var(--ty-shell-pad-inline)",
	WebkitOverflowScrolling: "touch",
	scrollbarGutter: "stable",
	scrollbarWidth: "thin",
	scrollbarColor: "transparent transparent",
	_hover: {
		scrollbarColor:
			"rgba(var(--text-r),var(--text-g),var(--text-b),0.28) transparent",
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

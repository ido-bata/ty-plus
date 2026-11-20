/**
 * ScrollArea component for ty-plus
 * React component for the existing .wsd-main-scroll pattern
 * Custom scrollbar styling with scrollbar-gutter: stable
 */

import type { JSX, ReactNode } from "react";

import { css } from "@/styled-system/css";

export type ScrollAreaProps = {
	children: ReactNode;
	className?: string;
	/** Vertical scrollbar gutter behavior */
	gutterStable?: boolean;
};

const base = css({
	minHeight: 0,
	overflowX: "hidden",
	overflowY: "auto",
});

const gutterStable = css({
	scrollbarGutter: "stable",
});

export function ScrollArea({
	children,
	className = "",
	gutterStable: gutter = true,
}: ScrollAreaProps): JSX.Element {
	return (
		<div
			className={`ty-scroll-area ${base} ${gutter ? gutterStable : ""} ${className}`.trim()}
		>
			{children}
		</div>
	);
}

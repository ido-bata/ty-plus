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
	scrollbarWidth: "thin",
	// The scrollbar thumb must be visible at rest — a fully transparent
	// thumb gives zero overflow affordance (issue #735). It shares the
	// workspace scrollbar tokens so scroll areas and dialogs read the
	// same. `scrollbar-color` degrades gracefully on older CEF.
	scrollbarColor:
		"rgba(var(--text-r),var(--text-g),var(--text-b),var(--ty-opacity-ws-scrollbar-thumb-strong)) transparent",
	_hover: {
		scrollbarColor:
			"rgba(var(--text-r),var(--text-g),var(--text-b),0.4) transparent",
	},
	// CEF 99 ignores `scrollbar-color` entirely and falls back to
	// `::-webkit-scrollbar` styling — where `app.css` hides the thumb until
	// hover (`*:hover::-webkit-scrollbar-thumb`). Without this override a
	// scrollable dialog body shows zero overflow affordance at rest, which
	// is exactly the defect `scrollbar-color` was added to prevent
	// (issue #766). Utilities layer beats the `base`-layer hover rule.
	"&::-webkit-scrollbar-thumb": {
		visibility: "visible",
	},
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

import type { JSX } from "react";
import { css } from "@/styled-system/css";

const overlayClass = css({
	pointerEvents: "none",
	position: "absolute",
	top: "3",
	left: "3",
	color: "text.muted",
});

export function PlaceholderOverlay({
	placeholder,
}: {
	placeholder?: string;
}): JSX.Element | null {
	if (!placeholder) return null;
	return (
		<div className={overlayClass} aria-hidden="true">
			{placeholder}
		</div>
	);
}

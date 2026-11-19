import type { JSX } from "react";

import { cx } from "@/shared/util/cx";
import { css } from "@/styled-system/css";

export type DirectoryBrowserViewMode = "list" | "icons";

export type DirectoryBrowserViewModeToggleProps = {
	viewMode: DirectoryBrowserViewMode;
	onChange: (mode: DirectoryBrowserViewMode) => void;
	listViewAriaLabel?: string;
	iconViewAriaLabel?: string;
};

const wrapperClass = css({
	display: "flex",
	gap: "1",
	marginLeft: "auto",
	flexShrink: 0,
});

const buttonBaseClass = css({
	borderRadius: "shell-sm",
	padding: "1",
	transitionProperty: "colors",
});
const buttonActiveClass = css({
	backgroundColor: "surface.widget",
	color: "text.primary",
});
const buttonInactiveClass = css({
	color: "text.muted",
	_hover: { backgroundColor: "interactive.hover" },
});
const svgClass = css({
	height: "4",
	width: "4",
});

function viewButtonClass(active: boolean): string {
	return cx(buttonBaseClass, active ? buttonActiveClass : buttonInactiveClass);
}

export function DirectoryBrowserViewModeToggle({
	viewMode,
	onChange,
	listViewAriaLabel = "List view",
	iconViewAriaLabel = "Icon view",
}: DirectoryBrowserViewModeToggleProps): JSX.Element {
	return (
		<div className={wrapperClass}>
			<button
				type="button"
				className={viewButtonClass(viewMode === "list")}
				onClick={() => {
					onChange("list");
				}}
				aria-label={listViewAriaLabel}
			>
				<svg
					role="presentation"
					className={svgClass}
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={2}
						d="M4 6h16M4 10h16M4 14h16M4 18h16"
					/>
				</svg>
			</button>
			<button
				type="button"
				className={viewButtonClass(viewMode === "icons")}
				onClick={() => {
					onChange("icons");
				}}
				aria-label={iconViewAriaLabel}
			>
				<svg
					role="presentation"
					className={svgClass}
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={2}
						d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 0 1 1 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"
					/>
				</svg>
			</button>
		</div>
	);
}

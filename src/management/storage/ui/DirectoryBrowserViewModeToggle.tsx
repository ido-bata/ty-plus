import { Icon, IconButton } from "@ty-plus/ui";
import { LayoutGrid, List as ListIcon } from "lucide-react";
import type { JSX } from "react";
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

/**
 * List / icon view toggle.
 *
 * Both buttons are shared `IconButton`s: the focus ring, the radius and the
 * selected surface come from the shared component (`active`), and
 * `aria-pressed` states the pressed state to assistive technology — a
 * screen reader can tell which mode is active.
 */
export function DirectoryBrowserViewModeToggle({
	viewMode,
	onChange,
	listViewAriaLabel = "List view",
	iconViewAriaLabel = "Icon view",
}: DirectoryBrowserViewModeToggleProps): JSX.Element {
	return (
		<div className={wrapperClass}>
			<IconButton
				type="button"
				variant="ghost"
				size="sm"
				active={viewMode === "list"}
				aria-pressed={viewMode === "list"}
				aria-label={listViewAriaLabel}
				title={listViewAriaLabel}
				onClick={() => {
					onChange("list");
				}}
			>
				<Icon icon={ListIcon} size={4} />
			</IconButton>
			<IconButton
				type="button"
				variant="ghost"
				size="sm"
				active={viewMode === "icons"}
				aria-pressed={viewMode === "icons"}
				aria-label={iconViewAriaLabel}
				title={iconViewAriaLabel}
				onClick={() => {
					onChange("icons");
				}}
			>
				<Icon icon={LayoutGrid} size={4} />
			</IconButton>
		</div>
	);
}

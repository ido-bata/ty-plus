import { LayoutGrid, List as ListIcon } from "lucide-react";
import type { JSX } from "react";
import { Icon, IconButton } from "@/shared/component";
import { css, cx } from "@/styled-system/css";

export type CatalogBrowserViewMode = "list" | "icons";

export type ViewModeToggleProps = {
	viewMode: CatalogBrowserViewMode;
	onViewModeChange: (mode: CatalogBrowserViewMode) => void;
	/** Extra hook when entering icon view (e.g. preset dialog resets group browse). */
	onEnterIconView?: () => void;
	/** Accessible labels (e.g. from `useTranslation("widgets")`). */
	listViewAriaLabel?: string;
	iconViewAriaLabel?: string;
	fieldsetLegend?: string;
};

const fieldsetClass = css({
	margin: "0",
	display: "flex",
	height: "full",
	minWidth: "0",
	flexShrink: "0",
	overflow: "hidden",
	borderRadius: "shell-sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.widget",
	opacity: 0.5,
	padding: "px",
});

const srOnlyClass = css({
	position: "absolute",
	width: "1px",
	height: "1px",
	padding: "0",
	margin: "-1px",
	overflow: "hidden",
	clip: "rect(0,0,0,0)",
	whiteSpace: "nowrap",
	borderWidth: "0",
});

const buttonBaseClass = css({
	height: "full",
	minHeight: "0",
	width: "8",
	flexShrink: "0",
	borderRadius: "0",
	borderWidth: "0",
	padding: "0",
});

const buttonActiveClass = css({
	backgroundColor: "surface.widget",
	color: "text.primary",
	boxShadow: "sm",
});

const buttonInactiveClass = css({ color: "text.muted" });

const separatorClass = css({
	width: "px",
	flexShrink: "0",
	alignSelf: "stretch",
	backgroundColor: "border.default",
});

/**
 * List / icon segmented control shared by {@link PresetsDialog} and directory-browser widget.
 */
export function CatalogBrowserViewModeToggle({
	viewMode,
	onViewModeChange,
	onEnterIconView,
	listViewAriaLabel = "List view",
	iconViewAriaLabel = "Icon view",
	fieldsetLegend = "Catalog layout",
}: ViewModeToggleProps): JSX.Element {
	return (
		<fieldset className={fieldsetClass}>
			<legend className={srOnlyClass}>{fieldsetLegend}</legend>
			<IconButton
				variant="ghost"
				size="sm"
				type="button"
				aria-pressed={viewMode === "list"}
				aria-label={listViewAriaLabel}
				title={listViewAriaLabel}
				className={cx(
					buttonBaseClass,
					viewMode === "list" ? buttonActiveClass : buttonInactiveClass,
				)}
				onClick={() => {
					onViewModeChange("list");
				}}
			>
				<Icon icon={ListIcon} size={10} />
			</IconButton>
			<div className={separatorClass} aria-hidden />
			<IconButton
				variant="ghost"
				size="sm"
				type="button"
				aria-pressed={viewMode === "icons"}
				aria-label={iconViewAriaLabel}
				title={iconViewAriaLabel}
				className={cx(
					buttonBaseClass,
					viewMode === "icons" ? buttonActiveClass : buttonInactiveClass,
				)}
				onClick={() => {
					onEnterIconView?.();
					onViewModeChange("icons");
				}}
			>
				<Icon icon={LayoutGrid} size={10} />
			</IconButton>
		</fieldset>
	);
}

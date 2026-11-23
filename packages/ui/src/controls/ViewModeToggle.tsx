import { Icon, IconButton } from "@ty-plus/ui";
import { LayoutGrid, List as ListIcon } from "lucide-react";
import type { JSX } from "react";
import { useTranslation } from "react-i18next";
import { css, cx } from "@/styled-system/css";
import { srOnlyClass } from "../styles/typography";

export type ViewMode = "list" | "icons";

export type ViewModeToggleProps = {
	viewMode: ViewMode;
	onViewModeChange: (mode: ViewMode) => void;
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
	borderColor: "border.control",
	backgroundColor: "surface.widget",
	opacity: 0.5,
	padding: "px",
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
 * The list / icon view toggle.
 *
 * A generic control: it is offered by the preset catalog, the file entry
 * list, the widget catalog and the font viewer, so it lives in the shared
 * design system rather than in one of the features that use it.
 */
export function ViewModeToggle({
	viewMode,
	onViewModeChange,
	onEnterIconView,
	listViewAriaLabel,
	iconViewAriaLabel,
	fieldsetLegend,
}: ViewModeToggleProps): JSX.Element {
	const { t } = useTranslation();
	const resolvedListViewAriaLabel =
		listViewAriaLabel ??
		t("widgets:viewModeToggle.listView", { defaultValue: "List view" });
	const resolvedIconViewAriaLabel =
		iconViewAriaLabel ??
		t("widgets:viewModeToggle.iconView", { defaultValue: "Icon view" });
	const resolvedFieldsetLegend =
		fieldsetLegend ??
		t("widgets:viewModeToggle.fieldsetLegend", {
			defaultValue: "Catalog layout",
		});
	return (
		<fieldset className={fieldsetClass}>
			<legend className={srOnlyClass}>{resolvedFieldsetLegend}</legend>
			<IconButton
				variant="ghost"
				size="sm"
				type="button"
				aria-pressed={viewMode === "list"}
				aria-label={resolvedListViewAriaLabel}
				title={resolvedListViewAriaLabel}
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
				aria-label={resolvedIconViewAriaLabel}
				title={resolvedIconViewAriaLabel}
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

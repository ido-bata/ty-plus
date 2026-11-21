import { Icon, IconButton } from "@ty-plus/ui";
import { cx } from "@ty-plus/ui/util/cx";
import { ArrowUp, HardDrive, RefreshCw, Settings2 } from "lucide-react";
import type { JSX } from "react";
import { i18n } from "@/management/i18n/index";
import { CatalogBrowserViewModeToggle } from "@/management/preset";
import { css } from "@/styled-system/css";
export function BrowserToolbar(props: {
	goUpAvailable: boolean;
	filtersExpanded: boolean;
	onRefresh: () => void;
	onGoUp: () => void;
	onBrowseDrives: () => void;
	onToggleFilters: () => void;
	viewMode: "list" | "icons";
	onViewModeChange: (next: "list" | "icons") => void;
	detailedFiltersLabel: string;
	listViewAriaLabel: string;
	iconViewAriaLabel: string;
	viewModeLegend: string;
}): JSX.Element {
	const {
		goUpAvailable,
		filtersExpanded,
		onRefresh,
		onGoUp,
		onBrowseDrives,
		onToggleFilters,
		viewMode,
		onViewModeChange,
		detailedFiltersLabel,
		listViewAriaLabel,
		iconViewAriaLabel,
		viewModeLegend,
	} = props;
	const iconBtnClass = css({
		height: "full",
		minHeight: 0,
		width: "8",
		flexShrink: 0,
		alignSelf: "stretch",
		borderRadius: "shell-sm",
		borderWidth: "1px",
		borderStyle: "solid",
		borderColor: "border.default",
		backgroundColor: "surface.widget",
		padding: 0,
		color: "text.muted",
		_hover: { color: "text.primary" },
		_disabled: {
			cursor: "not-allowed",
			opacity: 0.5,
		},
	});
	return (
		<div
			data-directory-browser-toolbar
			data-directory-browser-body
			className={css({
				display: "flex",
				height: "8",
				flexShrink: 0,
				alignItems: "stretch",
				gap: "1",
			})}
		>
			{" "}
			<IconButton
				variant="ghost"
				size="sm"
				className={iconBtnClass}
				aria-label={i18n.t("common:actions.refresh")}
				title={i18n.t("common:actions.refresh")}
				onClick={() => {
					void onRefresh();
				}}
			>
				{" "}
				<Icon icon={RefreshCw} size={10} />{" "}
			</IconButton>{" "}
			<IconButton
				variant="ghost"
				size="sm"
				className={iconBtnClass}
				aria-label={i18n.t("widgets:folderDirectoryPicker.goUp")}
				title={i18n.t("widgets:folderDirectoryPicker.goUp")}
				disabled={!goUpAvailable}
				onClick={onGoUp}
			>
				{" "}
				<Icon icon={ArrowUp} size={10} />{" "}
			</IconButton>{" "}
			<IconButton
				variant="ghost"
				size="sm"
				className={iconBtnClass}
				aria-label={i18n.t("widgets:directoryBrowser.entry.browseDrives")}
				title={i18n.t("widgets:directoryBrowser.entry.browseDrives")}
				onClick={onBrowseDrives}
			>
				{" "}
				<Icon icon={HardDrive} size={10} />{" "}
			</IconButton>{" "}
			<IconButton
				variant="ghost"
				size="sm"
				className={cx(
					css({
						height: "full",
						minHeight: 0,
						width: "8",
						flexShrink: 0,
						alignSelf: "stretch",
						borderRadius: "shell-sm",
						borderWidth: "1px",
						borderStyle: "solid",
						padding: 0,
					}),
					filtersExpanded
						? css({
								borderColor: "border.strong",
								backgroundColor: "surface.widget",
								color: "text.primary",
							})
						: css({
								borderColor: "border.default",
								backgroundColor: "surface.widget",
								color: "text.muted",
								opacity: 0.5,
								_hover: { color: "text.primary" },
							}),
				)}
				aria-label={detailedFiltersLabel}
				title={detailedFiltersLabel}
				onClick={onToggleFilters}
			>
				{" "}
				<Icon icon={Settings2} size={10} />{" "}
			</IconButton>{" "}
			<CatalogBrowserViewModeToggle
				viewMode={viewMode}
				onViewModeChange={onViewModeChange}
				fieldsetLegend={viewModeLegend}
				listViewAriaLabel={listViewAriaLabel}
				iconViewAriaLabel={iconViewAriaLabel}
			/>{" "}
		</div>
	);
}

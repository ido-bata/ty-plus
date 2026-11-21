import { Icon, IconButton, ViewModeToggle } from "@ty-plus/ui";
import { ArrowUp, HardDrive, RefreshCw, Settings2 } from "lucide-react";
import type { JSX } from "react";
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
	refreshLabel: string;
	goUpLabel: string;
	browseDrivesLabel: string;
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
		refreshLabel,
		goUpLabel,
		browseDrivesLabel,
	} = props;
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
				variant="default"
				size="md"
				aria-label={refreshLabel}
				title={refreshLabel}
				onClick={() => {
					void onRefresh();
				}}
			>
				{" "}
				<Icon icon={RefreshCw} size={12} />{" "}
			</IconButton>{" "}
			<IconButton
				variant="default"
				size="md"
				aria-label={goUpLabel}
				title={goUpLabel}
				disabled={!goUpAvailable}
				onClick={onGoUp}
			>
				{" "}
				<Icon icon={ArrowUp} size={12} />{" "}
			</IconButton>{" "}
			<IconButton
				variant="default"
				size="md"
				aria-label={browseDrivesLabel}
				title={browseDrivesLabel}
				onClick={onBrowseDrives}
			>
				{" "}
				<Icon icon={HardDrive} size={12} />{" "}
			</IconButton>{" "}
			<IconButton
				variant="ghost"
				size="md"
				active={filtersExpanded}
				aria-pressed={filtersExpanded}
				aria-label={detailedFiltersLabel}
				title={detailedFiltersLabel}
				onClick={onToggleFilters}
			>
				{" "}
				<Icon icon={Settings2} size={12} />{" "}
			</IconButton>{" "}
			<ViewModeToggle
				viewMode={viewMode}
				onViewModeChange={onViewModeChange}
				fieldsetLegend={viewModeLegend}
				listViewAriaLabel={listViewAriaLabel}
				iconViewAriaLabel={iconViewAriaLabel}
			/>{" "}
		</div>
	);
}

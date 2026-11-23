import { Icon, IconButton, SearchField, ViewModeToggle } from "@ty-plus/ui";
import { LoaderCircle, RefreshCw, Search } from "lucide-react";
import type { JSX, ReactNode } from "react";
import { i18n } from "@/management/i18n/index";
import { css } from "@/styled-system/css";

export type LoadPhase = "idle" | "reading" | "streaming" | "error";
export type PresetViewMode = "list" | "icons";

/**
 * The preset list dialog distinguishes a successful terminal load (`"loaded"`)
 * from the catalog hook's phases, so the header accepts the wider union.
 */
type HeaderLoadPhase = LoadPhase | "loaded";

const headerRowClass = css({
	display: "flex",
	minHeight: "8",
	minWidth: "0",
	alignItems: "stretch",
	gap: "2",
});

const searchSlotClass = css({
	display: "flex",
	minHeight: "0",
	minWidth: "0",
	flex: "1",
	alignItems: "stretch",
});

const toolbarSlotClass = css({
	display: "flex",
	height: "8",
	flexShrink: "0",
	alignItems: "stretch",
	gap: "1",
	alignSelf: "stretch",
});

const searchFieldClass = css({
	height: "8",
	minHeight: "8",
	flex: "1",
	paddingBlock: "0",
});

const reloadButtonClass = css({
	height: "full",
	minHeight: "0",
	width: "8",
	flexShrink: "0",
	alignSelf: "stretch",
	borderRadius: "shell-sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.widget/50",
	padding: "0",
	color: "text.muted",
	_hover: { color: "text.primary" },
});

const loadingInlineClass = css({
	display: "inline-flex",
	minWidth: "0",
	alignItems: "center",
	gap: "1",
	truncate: true,
});

const loadingSpinnerClass = css({
	height: "3",
	width: "3",
	flexShrink: "0",
	animation: "spin",
});

const loadingTextClass = css({ truncate: true });

const errorTextClass = css({
	truncate: true,
	color: "status.error",
});

const streamInfoRowClass = css({
	display: "inline-flex",
	minWidth: "0",
	maxWidth: "full",
	alignItems: "center",
	gap: "1.5",
	truncate: true,
});

const progressTrackClass = css({
	display: "inline-block",
	height: "1",
	width: "10",
	flexShrink: "0",
	overflow: "hidden",
	borderRadius: "full",
	backgroundColor: "border.default",
});

const progressFillClass = css({
	display: "block",
	height: "full",
	borderRadius: "full",
	backgroundColor: "interactive.focus",
	transitionProperty: "width",
	transitionDuration: "200ms",
});

const countClass = css({ flexShrink: "0", fontVariantNumeric: "tabular-nums" });

type SearchStatusBarProps = {
	loadPhase: HeaderLoadPhase;
	loadError: string | null;
	streamTotal: number;
	presetsLength: number;
	visibleCount: number;
	filter: string;
};

function SearchStatusBar(props: SearchStatusBarProps): ReactNode {
	const {
		loadPhase,
		loadError,
		streamTotal,
		presetsLength,
		visibleCount,
		filter,
	} = props;
	// "idle" means the first read has not finished yet — showing a count there
	// would claim "0 items" about a catalog we have not read.
	if (loadPhase === "idle" || loadPhase === "reading") {
		return (
			<span className={loadingInlineClass}>
				<LoaderCircle className={loadingSpinnerClass} aria-hidden />
				<span className={loadingTextClass}>
					{i18n.t("presets:catalogBrowser.loading")}
				</span>
			</span>
		);
	}
	if (loadPhase === "error") {
		return (
			<span className={errorTextClass} title={loadError ?? undefined}>
				{loadError ?? i18n.t("common:status.error")}
			</span>
		);
	}
	return (
		<span className={streamInfoRowClass}>
			{loadPhase === "streaming" && streamTotal > 0 ? (
				<>
					<span className={progressTrackClass} aria-hidden>
						<span
							className={progressFillClass}
							style={{
								width: `${Math.min(
									100,
									Math.round((presetsLength / Math.max(streamTotal, 1)) * 100),
								)}%`,
							}}
						/>
					</span>
					<span className={countClass}>
						{presetsLength}/{streamTotal}
					</span>
				</>
			) : null}
			<span className={countClass}>
				{i18n.t("presets:listDialog.visibleItems", { count: visibleCount })}
				{filter.trim() ? i18n.t("presets:listDialog.filteredSuffix") : ""}
			</span>
		</span>
	);
}

export type PresetsDialogHeaderProps = {
	filter: string;
	onFilterChange: (value: string) => void;
	onReload: () => void;
	loadPhase: HeaderLoadPhase;
	loadError: string | null;
	streamTotal: number;
	presetsLength: number;
	visibleCount: number;
	viewMode: PresetViewMode;
	onViewModeChange: (mode: PresetViewMode) => void;
	onEnterIconView: () => void;
};

export function PresetsDialogHeader(
	props: PresetsDialogHeaderProps,
): JSX.Element {
	const {
		filter,
		onFilterChange,
		onReload,
		loadPhase,
		loadError,
		streamTotal,
		presetsLength,
		visibleCount,
		viewMode,
		onViewModeChange,
		onEnterIconView,
	} = props;
	return (
		<div className={headerRowClass}>
			<div data-preset-list-search className={searchSlotClass}>
				<SearchField
					className={searchFieldClass}
					icon={Search}
					placeholder={i18n.t("presets:catalogBrowser.searchPlaceholder")}
					value={filter}
					onChange={(e) => onFilterChange(e.currentTarget.value)}
					showClearButton
					onClear={() => onFilterChange("")}
					showInlineTrailing
					inlineTrailing={
						<SearchStatusBar
							loadPhase={loadPhase}
							loadError={loadError}
							streamTotal={streamTotal}
							presetsLength={presetsLength}
							visibleCount={visibleCount}
							filter={filter}
						/>
					}
				/>
			</div>
			<div data-preset-list-toolbar className={toolbarSlotClass}>
				<ViewModeToggle
					viewMode={viewMode}
					onViewModeChange={onViewModeChange}
					onEnterIconView={onEnterIconView}
				/>
				<IconButton
					variant="ghost"
					size="sm"
					className={reloadButtonClass}
					aria-label={i18n.t("presets:catalogBrowser.reload")}
					title={i18n.t("presets:catalogBrowser.reload")}
					onClick={() => void onReload()}
				>
					<Icon icon={RefreshCw} size={10} />
				</IconButton>
			</div>
		</div>
	);
}

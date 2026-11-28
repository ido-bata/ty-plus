import { cx, Icon, IconButton, SearchField, ViewModeToggle } from "@ty-plus/ui";
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

// jobs6 (#792): the reload control used to re-skin `IconButton` with a
// local border/background recipe (allowlisted ui-override). The shared
// `default` variant already paints the bordered toolbar look, so the
// button now rides the variant/size contract — `md` (32px) is exactly the
// toolbar slot height, which also fixes the ~4px-short button that sat
// above the neighbors' centerline.
const reloadButtonClass = css({
	flexShrink: "0",
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
	// jobs6 (#792): `status.error` red inside the search field read as a
	// field-validation error, not a catalog-load failure. The body error
	// block carries the alert semantics; the trailing slot stays muted.
	color: "text.muted",
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

// jobs6 (#792): "20/50" and "20 items" rendered identically, so the live
// stream fraction was indistinguishable from the settled count. The
// fraction is the progressing readout — give it primary weight.
const streamFractionClass = css({
	color: "text.primary",
	fontWeight: "medium",
});

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
		// Issue #753: the trailing slot is one truncated line — a raw parser
		// error ("Unexpected token…") reads as noise there. Show the localized
		// failure label; the full `loadError` stays on `title` for hover.
		return (
			<span
				className={errorTextClass}
				title={loadError ?? i18n.t("presets:edit.status.loadFailed")}
			>
				{i18n.t("presets:edit.status.loadFailed")}
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
					<span className={cx(countClass, streamFractionClass)}>
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
					variant="default"
					size="md"
					className={reloadButtonClass}
					aria-label={i18n.t("presets:catalogBrowser.reload")}
					title={i18n.t("presets:catalogBrowser.reload")}
					onClick={() => void onReload()}
				>
					<Icon icon={RefreshCw} size={12} />
				</IconButton>
			</div>
		</div>
	);
}

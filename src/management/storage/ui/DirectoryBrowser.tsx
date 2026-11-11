import { FolderOpen } from "lucide-react";
import type { JSX, ReactNode } from "react";
import type { PresetIcon } from "@/management/preset/contract";
import type { FileBrowserFileType } from "@/management/storage/file-browser-service";
import { DirectoryBrowserIconCard } from "@/management/storage/ui/DirectoryBrowserIconCard";
import { EntryIcon } from "@/management/storage/ui/DirectoryBrowserShell.entry-icon";
import {
	type DirectoryBrowserViewMode,
	DirectoryBrowserViewModeToggle,
} from "@/management/storage/ui/DirectoryBrowserViewModeToggle";
import { cx } from "@/shared/util/cx";
import { isIMEComposing } from "@/shared/util/keyboard";
import { css } from "@/styled-system/css";

export type DirectoryBrowserEntry = {
	path: string;
	name: string;
	isDirectory: boolean;
	isPackage?: boolean;
	icon?: PresetIcon;
	/** Optional file type hint (union-typed; falls back to a generic glyph) */
	fileType?: FileBrowserFileType;
	/** Optional extension for media preview detection */
	extension?: string;
	/** Optional preview URL for image files */
	previewUrl?: string;
};

export type DirectoryBrowserShellSelectionMode = "files" | "folders" | "both";

export type DirectoryBrowserSelectionKind = "file" | "folder";

const kindOfEntry = (
	entry: DirectoryBrowserEntry,
): DirectoryBrowserSelectionKind => (entry.isDirectory ? "folder" : "file");

export type DirectoryBrowserAspect = "square" | "wide";

export type { DirectoryBrowserViewMode };

type DirectoryBrowserProps = {
	entries: readonly DirectoryBrowserEntry[];
	/**
	 * Optional file name extensions to filter entries (e.g. [".ffx", ".jsx"]).
	 * Directories always pass the filter.
	 * When omitted, all entries are shown.
	 */
	fileNameFilter?: readonly string[];
	loading: boolean;
	canGoUp: boolean;
	onGoUp: () => void;
	onEntryClick: (entry: DirectoryBrowserEntry) => void;
	/**
	 * Called when an entry is activated (double-click or Enter key).
	 * For files, this should open/execute. For directories, navigate into.
	 * Up-row always calls onGoUp on single-click.
	 */
	onEntryActivate?: (entry: DirectoryBrowserEntry) => void;
	selectionMode: DirectoryBrowserShellSelectionMode;
	isSelected: (
		entryPath: string,
		kind: DirectoryBrowserSelectionKind,
	) => boolean;
	onToggleSelected: (
		entryPath: string,
		kind: DirectoryBrowserSelectionKind,
	) => void;
	selectedSummary: string | { files: number; folders: number } | null;
	/**
	 * Whether to show selected summary in the scroll area footer.
	 * Default: true.
	 */
	showSelectedSummary?: boolean;
	emptyLabel?: string;
	loadingLabel?: string;
	upLabel?: string;
	/**
	 * Fully controlled display mode. The kit keeps no internal view state;
	 * owners pass the #65 shared hooks (or local state) down.
	 */
	viewMode: DirectoryBrowserViewMode;
	onViewModeChange: (mode: DirectoryBrowserViewMode) => void;
	/**
	 * Grid zoom scale. Applied to the icon grid cell size as
	 * `cellBaseRem * scale`.
	 */
	scale: number;
	/**
	 * Tile media shape. `"square"` renders the 4:3 media band,
	 * `"wide"` renders a 16:9 band.
	 */
	aspect: DirectoryBrowserAspect;
	/**
	 * Grid cell base width in rem at scale 1. Default 4.
	 */
	cellBaseRem?: number;
	/**
	 * Whether to show the list/icons toggle in the footer. Default true.
	 * Owners with their own toolbar toggle (e.g. the workspace widget)
	 * hide it to avoid duplication.
	 */
	showViewToggle?: boolean;
	/**
	 * Single-active path (e.g. single-selected file). Highlighted without
	 * implying checkbox selection.
	 */
	activePath?: string | null;
	/**
	 * Owner-provided tile content. Returns the tile media (placed inside
	 * the media band) and an optional overlay (positioned absolutely on
	 * the card). Defaults to the shared entry-icon rendering.
	 */
	renderTile?: (entry: DirectoryBrowserEntry) => {
		media: ReactNode;
		overlay?: ReactNode;
	};
	/**
	 * Owner-provided row content. Returns the row icon and optional
	 * trailing content (rendered after the checkboxes). Defaults to the
	 * shared entry-icon rendering.
	 */
	renderRow?: (entry: DirectoryBrowserEntry) => {
		icon?: ReactNode;
		trailing?: ReactNode;
	};
	/**
	 * Sticky list header node rendered at the top of the list scroll area.
	 */
	listHeader?: ReactNode;
	footerExtra?: ReactNode;
};

const shellRowBtn = css({
	display: "flex",
	width: "full",
	minWidth: 0,
	alignItems: "center",
	justifyContent: "space-between",
	gap: "2",
	paddingInline: "2",
	paddingBlock: "1.5",
	textAlign: "left",
	fontSize: "shell-text-sm",
	color: "text.primary",
	transitionProperty: "colors",
	_hover: {
		backgroundColor:
			"color-mix(in_oklab,var(--color-interactive-hover)_38%,transparent)",
	},
});

const shellRowWrap = css({
	borderBottomWidth: "1px",
	borderBottomStyle: "solid",
	borderBottomColor: "border.default",
	"&:last-child": { borderBottomWidth: 0 },
});

const shellListIconSize = 16;

const rowInnerClass = css({
	display: "flex",
	minWidth: 0,
	alignItems: "stretch",
	gap: "1",
});
/**
 * `activePath` cue — the on-disk "current" path.  Rendered as a top
 * accent via inset box-shadow so the visual channel is independent
 * of `rowInnerSelectedClass`'s background fill; active + selected
 * must be distinguishable from selected alone, and stacking two
 * `backgroundColor` rules would let the later one win (PR #148
 * inline review).  Top accent + left accent + background fill all
 * coexist in the overlap state.
 */
const rowInnerActiveClass = css({
	boxShadow: "inset 0 2px 0 0 var(--color-border-strong)",
});
/**
 * `isSelected` cue — the user toggled this row.  Match the visual
 * language used by `ListSelect` (interactive.hover surface) and add
 * a left-edge accent.  The accent is rendered as an inset box-shadow
 * rather than a border so it does not consume layout space and the
 * row height stays identical to an unselected row.
 *
 * The background fill is a 25% mix of `interactive.hover` — slightly
 * darker than the 38% mix used by `shellRowBtn._hover`.  The button
 * paints its hover fill on top of this inner div, so if the inner
 * were at the full `interactive.hover` token (8% white) the row would
 * *darken* on hover instead of lightening (review #148 inline).  At
 * 25% (~2% white) the inner sits just under the button hover mix
 * (~3% white), so a selected row still receives the standard
 * lightening-on-hover feedback.  Selection itself remains clearly
 * distinguished from an unselected hover by the left accent.
 */
const rowInnerSelectedClass = css({
	backgroundColor:
		"color-mix(in_oklab,var(--color-interactive-hover)_25%,transparent)",
	boxShadow: "inset 2px 0 0 0 var(--color-border-strong)",
});
/**
 * Overlap of `activePath` + `isSelected`.  The visual contract requires
 * *both* accents (top + left) and the selected background fill to be
 * visible at once.  Declared as a separate class so that `box-shadow`
 * is set in one declaration (multiple inset shadows comma-separated in
 * a single value) instead of two conflicting classes in the cascade
 * where the later class would clobber the top accent (PR #148 inline
 * review).  Background fill mirrors `rowInnerSelectedClass` — see the
 * hover-vs-selected note there for the rationale behind the lighter
 * mix.
 */
const rowInnerActiveAndSelectedClass = css({
	backgroundColor:
		"color-mix(in_oklab,var(--color-interactive-hover)_25%,transparent)",
	boxShadow:
		"inset 0 2px 0 0 var(--color-border-strong), inset 2px 0 0 0 var(--color-border-strong)",
});
const rowBtnFlex1Class = css({ flex: "1" });

const rowLeftIconClass = css({
	display: "flex",
	minWidth: 0,
	flex: "1",
	alignItems: "center",
	gap: "2",
});
const rowEntryTextClass = css({
	minWidth: 0,
	truncate: true,
});
/**
 * Color-only change for selected rows.  Selection is expressed via the
 * row inner surface + left accent (see `rowInnerSelectedClass`); the
 * glyph itself must not change weight, font-size, line-height, or
 * letter-spacing — that would cause neighbour reflow.
 */
const rowEntryTextSelectedClass = css({
	color: "text.primary",
});

const checkboxLabelClass = css({
	display: "flex",
	flexShrink: 0,
	alignItems: "center",
	paddingInline: "1",
});
const checkboxClass = css({
	height: "4",
	width: "4",
	borderRadius: "sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.widget",
});

const summaryClass = css({
	fontSize: "shell-text-sm",
	color: "text.muted",
	truncate: true,
	whiteSpace: "nowrap",
});

const footerClass = css({
	display: "flex",
	alignItems: "center",
	gap: "2",
	borderTopWidth: "1px",
	borderTopStyle: "solid",
	borderTopColor: "border.default",
	backgroundColor: "surface.widget",
	paddingBlock: "0",
	paddingInline: "1",
	flexShrink: 0,
});

const footerSummaryClass = css({
	display: "flex",
	alignItems: "center",
	gap: "3",
	fontSize: "shell-text-sm",
	color: "text.muted",
});

const iconBodyClass = css({
	display: "flex",
	minHeight: 0,
	minWidth: 0,
	flexDirection: "column",
	overflow: "hidden",
	borderRadius: "md",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.dialog",
	height: "full",
});
const iconScrollClass = css({
	display: "grid",
	gridAutoRows: "min",
	alignContent: "start",
	alignItems: "start",
	gap: "1",
	padding: "1.5",
	overflowY: "auto",
	flex: "1",
	minHeight: 0,
});
const iconLoadingClass = css({
	gridColumn: "1 / -1",
	display: "grid",
	minHeight: "28",
	placeItems: "center",
	fontSize: "shell-text-sm",
	color: "text.muted",
});
const stickyHeaderClass = css({
	position: "sticky",
	top: 0,
	zIndex: 10,
});

const upButtonClass = css({
	position: "relative",
	display: "flex",
	height: "auto",
	flexDirection: "column",
	alignItems: "stretch",
	alignSelf: "stretch",
	overflow: "hidden",
	borderRadius: "shell-sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.dialog",
	transitionProperty: "colors",
	_hover: { backgroundColor: "interactive.hover" },
	minWidth: 0,
	maxWidth: "full",
});
const mediaBandBaseClass = css({
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	overflow: "hidden",
});
const mediaBandWideClass = css({
	aspectRatio: "video",
	width: "full",
});
const mediaBandSquareClass = css({
	aspectRatio: "4/3",
	width: "full",
});
const upIconInnerClass = css({
	display: "flex",
	aspectRatio: "square",
	height: "70%",
	alignItems: "center",
	justifyContent: "center",
	color: "text.primary",
});
const upIconSvgClass = css({
	height: "full",
	width: "full",
	flexShrink: 0,
});
const upLabelClass = css({
	width: "full",
	truncate: true,
	borderTopWidth: "1px",
	borderTopStyle: "solid",
	borderTopColor: "border.default",
	paddingInline: "2",
	paddingBlock: "1",
	textAlign: "center",
	fontSize: "shell-text-sm",
	lineHeight: "tight",
	color: "text.muted",
});
const emptyLabelClass = css({
	gridColumn: "1 / -1",
	paddingInline: "2",
	paddingBlock: "3",
	textAlign: "center",
	fontSize: "shell-text-sm",
	color: "text.muted",
});

const listBodyClass = css({
	display: "flex",
	minWidth: 0,
	flexDirection: "column",
	borderRadius: "md",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.dialog",
	overflow: "hidden",
	height: "full",
});
const listScrollClass = css({
	overflowY: "auto",
	flex: "1",
	minHeight: 0,
});
const listLoadingClass = css({
	display: "grid",
	minHeight: "28",
	placeItems: "center",
	fontSize: "shell-text-sm",
	color: "text.muted",
});
const upRowClass = css({
	borderBottomWidth: "1px",
	borderBottomStyle: "solid",
	borderBottomColor: "border.default",
	backgroundColor:
		"color-mix(in_oklab,var(--color-surface-widget)_50%,var(--color-surface-dialog))",
});
const listEmptyLabelClass = css({
	paddingInline: "2",
	paddingBlock: "3",
	fontSize: "shell-text-sm",
	color: "text.muted",
});

function mediaBandClass(aspect: DirectoryBrowserAspect): string {
	return cx(
		mediaBandBaseClass,
		aspect === "wide" ? mediaBandWideClass : mediaBandSquareClass,
	);
}

export const DirectoryBrowser = ({
	entries,
	fileNameFilter,
	loading,
	canGoUp,
	onGoUp,
	onEntryClick,
	onEntryActivate,
	selectionMode,
	isSelected,
	onToggleSelected,
	selectedSummary,
	showSelectedSummary = true,
	emptyLabel = "No files found",
	loadingLabel = "Loading...",
	upLabel = "..",
	viewMode,
	onViewModeChange,
	scale,
	aspect,
	cellBaseRem = 4,
	showViewToggle = true,
	activePath = null,
	renderTile,
	renderRow,
	listHeader,
	footerExtra,
}: DirectoryBrowserProps) => {
	const displayedEntries: readonly DirectoryBrowserEntry[] = fileNameFilter
		? entries.filter((e) =>
				e.isDirectory
					? true
					: fileNameFilter.some((ext) =>
							e.name.toLowerCase().endsWith(ext.toLowerCase()),
						),
			)
		: entries;

	const showFileCheckbox = (entry: DirectoryBrowserEntry) =>
		!entry.isDirectory &&
		entry.path !== "" && // up-entry has empty path
		(selectionMode === "files" || selectionMode === "both");

	const showFolderCheckbox = (entry: DirectoryBrowserEntry) =>
		entry.isDirectory &&
		entry.path !== "" && // up-entry has empty path
		(selectionMode === "folders" || selectionMode === "both");

	const showCheckbox = (entry: DirectoryBrowserEntry) =>
		showFileCheckbox(entry) || showFolderCheckbox(entry);

	const handleRowClick = (entry: DirectoryBrowserEntry) => {
		onEntryClick(entry);
	};

	// Up-row uses single-click to go up
	const handleUpRowClick = (): void => {
		onGoUp();
	};

	const handleRowActivate = (entry: DirectoryBrowserEntry): void => {
		onEntryActivate?.(entry);
	};

	// Synthetic up-entry for normalized row rendering (up is always single-click)
	const previewEntry: DirectoryBrowserEntry = {
		path: "",
		name: upLabel,
		isDirectory: true,
	};

	// Render a normalized list-mode row (shared by up-row and normal entries)
	const renderListRow = (
		entry: DirectoryBrowserEntry,
		entryOnClick: () => void,
		entryOnActivate?: () => void,
	): JSX.Element => {
		const selected = isSelected(entry.path, kindOfEntry(entry));
		const active = activePath != null && activePath === entry.path;
		// Up-row (empty path) is single-click navigation; regular directories
		// require double-click. Files still fire onEntryClick on single-click.
		const isUpRow = entry.path === "";
		return (
			<div
				key={entry.path}
				className={shellRowWrap}
				data-row-state={
					selected && active
						? "active+selected"
						: selected
							? "selected"
							: active
								? "active"
								: "none"
				}
			>
				<div
					className={cx(
						rowInnerClass,
						active && selected && rowInnerActiveAndSelectedClass,
						active && !selected && rowInnerActiveClass,
						selected && !active && rowInnerSelectedClass,
					)}
					data-row-active={active ? "true" : "false"}
					data-row-selected={selected ? "true" : "false"}
				>
					<button
						type="button"
						data-directory-browser-entry=""
						data-entry-kind={entry.isDirectory ? "dir" : "file"}
						data-entry-path={entry.path}
						className={cx(shellRowBtn, rowBtnFlex1Class)}
						onClick={isUpRow || !entry.isDirectory ? entryOnClick : undefined}
						onDoubleClick={entryOnActivate}
						onKeyDown={(ev) => {
							if (isIMEComposing(ev)) return;
							if (ev.key === "Enter" && entryOnActivate) {
								ev.preventDefault();
								entryOnActivate();
							}
						}}
					>
						<span className={rowLeftIconClass}>
							{renderRow?.(entry).icon ?? (
								<EntryIcon entry={entry} size={shellListIconSize} />
							)}
							<span
								className={cx(
									rowEntryTextClass,
									selected && rowEntryTextSelectedClass,
								)}
							>
								{entry.name}
							</span>
						</span>
					</button>
					{showFileCheckbox(entry) ? (
						<label className={checkboxLabelClass}>
							<input
								type="checkbox"
								data-directory-browser-entry-select=""
								data-entry-path={entry.path}
								data-multi-select="true"
								data-multi-select-path={entry.path}
								className={checkboxClass}
								checked={isSelected(entry.path, "file")}
								onChange={() => onToggleSelected(entry.path, "file")}
								aria-label={`select file ${entry.name}`}
							/>
						</label>
					) : null}
					{showFolderCheckbox(entry) ? (
						<label className={checkboxLabelClass}>
							<input
								type="checkbox"
								data-directory-browser-entry-select=""
								data-entry-path={entry.path}
								data-multi-select="true"
								data-multi-select-path={entry.path}
								className={checkboxClass}
								checked={isSelected(entry.path, "folder")}
								onChange={() => onToggleSelected(entry.path, "folder")}
								aria-label={`select folder ${entry.name}`}
							/>
						</label>
					) : null}
					{renderRow?.(entry).trailing ?? null}
				</div>
			</div>
		);
	};

	const handleToggle =
		(entry: DirectoryBrowserEntry) =>
		(event?: React.MouseEvent): void => {
			event?.stopPropagation();
			onToggleSelected(entry.path, kindOfEntry(entry));
		};

	// Render summary section
	const renderSummary = () => {
		if (!showSelectedSummary || !selectedSummary) return null;
		if (typeof selectedSummary === "string") {
			return (
				<span
					className={cx(summaryClass, "ty-shell-directory-summary")}
					title={selectedSummary}
				>
					{selectedSummary}
				</span>
			);
		}
		const parts: string[] = [];
		if (selectedSummary.files > 0) {
			parts.push(
				`${selectedSummary.files} file${selectedSummary.files !== 1 ? "s" : ""}`,
			);
		}
		if (selectedSummary.folders > 0) {
			parts.push(
				`${selectedSummary.folders} folder${selectedSummary.folders !== 1 ? "s" : ""}`,
			);
		}
		return <span>{parts.join(" ")} selected</span>;
	};

	const footer = (
		<div className={footerClass}>
			{showSelectedSummary && selectedSummary ? (
				<div className={footerSummaryClass}>{renderSummary()}</div>
			) : null}
			{footerExtra}
			{showViewToggle ? (
				<DirectoryBrowserViewModeToggle
					viewMode={viewMode}
					onChange={onViewModeChange}
				/>
			) : null}
		</div>
	);

	// Icon view mode
	if (viewMode === "icons") {
		return (
			<div
				data-directory-browser-body=""
				className={cx(iconBodyClass, "ty-shell-directory-browser")}
			>
				<div
					className={cx(iconScrollClass, "ty-shell-directory-scroll grid")}
					style={{
						gridTemplateColumns: `repeat(auto-fill, minmax(${cellBaseRem * scale}rem, 1fr))`,
					}}
				>
					{loading ? (
						<div className={iconLoadingClass}>{loadingLabel}</div>
					) : (
						<>
							{listHeader ? (
								<div className={stickyHeaderClass}>{listHeader}</div>
							) : null}
							{canGoUp ? (
								<button
									type="button"
									className={upButtonClass}
									onClick={onGoUp}
								>
									<div className={mediaBandClass(aspect)}>
										<div className={upIconInnerClass}>
											<FolderOpen className={upIconSvgClass} aria-hidden />
										</div>
									</div>
									<span className={upLabelClass}>{upLabel}</span>
								</button>
							) : null}
							{displayedEntries.length === 0 ? (
								<div className={emptyLabelClass}>{emptyLabel}</div>
							) : (
								displayedEntries.map((entry) => (
									<DirectoryBrowserIconCard
										key={entry.path}
										entry={entry}
										isSelected={isSelected(entry.path, kindOfEntry(entry))}
										onClick={() => handleRowClick(entry)}
										onDoubleClick={() => handleRowActivate(entry)}
										onToggle={handleToggle(entry)}
										showCheckbox={showCheckbox(entry)}
										aspect={aspect}
										renderTile={renderTile}
									/>
								))
							)}
						</>
					)}
				</div>
				{footer}
			</div>
		);
	}
	return (
		<div
			data-directory-browser-body=""
			className={cx(listBodyClass, "ty-shell-directory-browser")}
		>
			<div className={cx(listScrollClass, "ty-shell-directory-scroll")}>
				{loading ? (
					<div className={listLoadingClass}>{loadingLabel}</div>
				) : (
					<>
						{canGoUp ? (
							<div className={cx(upRowClass, "ty-shell-directory-up")}>
								{renderListRow(previewEntry, handleUpRowClick, undefined)}
							</div>
						) : null}
						{displayedEntries.length === 0 ? (
							<div className={listEmptyLabelClass}>{emptyLabel}</div>
						) : (
							displayedEntries.map((entry) =>
								renderListRow(
									entry,
									() => handleRowClick(entry),
									() => handleRowActivate(entry),
								),
							)
						)}
					</>
				)}
			</div>
			{footer}
		</div>
	);
};

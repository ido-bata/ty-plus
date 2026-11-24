import {
	Button,
	Checkbox,
	cx,
	Icon,
	IconButton,
	isIMEComposing,
	ScrollArea,
} from "@ty-plus/ui";
import { FolderOpen, LayoutGrid, List as ListIcon } from "lucide-react";
import type { JSX, ReactNode } from "react";
import { i18n } from "@/management/i18n/index";
import type { PresetIcon } from "@/management/preset/contract";
import type { FileBrowserFileType } from "@/management/storage/file-browser-service";
import { FileEntryCard } from "@/management/storage/ui/file-entry/FileEntryCard";
import { FileEntryGlyph } from "@/management/storage/ui/file-entry/FileEntryGlyph";
import { fileEntryMenuFileType } from "@/management/storage/ui/file-entry/file-entry-menu";
import { css } from "@/styled-system/css";

export type FileEntry = {
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

export type FileEntrySelectionMode = "files" | "folders" | "both";

export type FileEntryKind = "file" | "folder";

const kindOfEntry = (entry: FileEntry): FileEntryKind =>
	entry.isDirectory ? "folder" : "file";

export type FileEntryAspect = "square" | "wide";

/**
 * How the entries are laid out.  The kit renders both; the owner owns the
 * state (and may hide the toggle when it provides its own).
 */
export type FileEntryViewMode = "list" | "icons";

/**
 * The "N files / M folders selected" readout.
 *
 * The wording, the truncation behaviour and the `ty-shell-directory-summary`
 * hook live here so the kit renders the summary in exactly one place.
 */
export type FileEntrySummary = string | { files: number; folders: number };

const summaryClass = css({
	truncate: true,
	whiteSpace: "nowrap",
	fontSize: "shell-text-sm",
	color: "text.muted",
});

function FileEntrySelectedSummary({
	summary,
}: {
	summary: FileEntrySummary;
}): JSX.Element | null {
	if (typeof summary === "string") {
		return (
			<span
				className={cx("ty-shell-directory-summary", summaryClass)}
				title={summary}
			>
				{summary}
			</span>
		);
	}
	const parts: string[] = [];
	if (summary.files > 0) {
		parts.push(`${summary.files} file${summary.files !== 1 ? "s" : ""}`);
	}
	if (summary.folders > 0) {
		parts.push(`${summary.folders} folder${summary.folders !== 1 ? "s" : ""}`);
	}
	// A zero-count summary used to render a bare " selected" label — hide it
	// entirely instead of showing an empty count.
	if (parts.length === 0) return null;
	return <span className={summaryClass}>{parts.join(" ")} selected</span>;
}

function hasVisibleSummary(summary: FileEntrySummary): boolean {
	if (typeof summary === "string") return summary.trim().length > 0;
	return summary.files > 0 || summary.folders > 0;
}

/**
 * The list/icons toggle.  The active mode is published through
 * `aria-pressed` as well as the shared `active` surface, so the state is not
 * carried by colour alone.
 */
function FileEntryViewModeToggle({
	viewMode,
	onChange,
}: {
	viewMode: FileEntryViewMode;
	onChange: (mode: FileEntryViewMode) => void;
}): JSX.Element {
	return (
		<div className={viewToggleWrapClass}>
			<IconButton
				type="button"
				variant="ghost"
				size="sm"
				active={viewMode === "list"}
				aria-pressed={viewMode === "list"}
				aria-label={i18n.t("common:directoryBrowser.listView")}
				title={i18n.t("common:directoryBrowser.listView")}
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
				aria-label={i18n.t("common:directoryBrowser.iconView")}
				title={i18n.t("common:directoryBrowser.iconView")}
				onClick={() => {
					onChange("icons");
				}}
			>
				<Icon icon={LayoutGrid} size={4} />
			</IconButton>
		</div>
	);
}

const footerClass = css({
	display: "flex",
	alignItems: "center",
	gap: "2",
	borderTopWidth: "hairline",
	borderTopStyle: "solid",
	borderTopColor: "border.default",
	backgroundColor: "surface.widget",
	paddingBlock: "0",
	paddingInline: "1",
	flexShrink: 0,
});

const summaryWrapClass = css({
	display: "flex",
	alignItems: "center",
	gap: "3",
	minWidth: 0,
	fontSize: "shell-text-sm",
	color: "text.muted",
});

const viewToggleWrapClass = css({
	display: "flex",
	gap: "1",
	marginLeft: "auto",
	flexShrink: 0,
});

function FileEntryListFooter({
	viewMode,
	onViewModeChange,
	showSelectedSummary,
	selectedSummary,
	showViewToggle = true,
	footerExtra,
}: {
	viewMode: FileEntryViewMode;
	onViewModeChange?: (mode: FileEntryViewMode) => void;
	showSelectedSummary: boolean;
	selectedSummary?: FileEntrySummary | null;
	showViewToggle?: boolean;
	footerExtra?: ReactNode;
}): JSX.Element {
	return (
		<div className={footerClass}>
			{showSelectedSummary &&
			selectedSummary &&
			hasVisibleSummary(selectedSummary) ? (
				<div className={summaryWrapClass}>
					<FileEntrySelectedSummary summary={selectedSummary} />
				</div>
			) : null}
			{footerExtra}
			{showViewToggle && onViewModeChange ? (
				<FileEntryViewModeToggle
					viewMode={viewMode}
					onChange={onViewModeChange}
				/>
			) : null}
		</div>
	);
}

type FileEntryListProps = {
	entries: readonly FileEntry[];
	/**
	 * Optional file name extensions to filter entries (e.g. [".ffx", ".jsx"]).
	 * Directories always pass the filter.
	 * When omitted, all entries are shown.
	 */
	fileNameFilter?: readonly string[];
	loading: boolean;
	/**
	 * Whether the "up" row is offered.  Owners that do not navigate leave it
	 * out entirely instead of passing a no-op handler.
	 */
	canGoUp?: boolean;
	/** Called when the "up" row is activated. */
	onGoUp?: () => void;
	onEntryClick: (entry: FileEntry) => void;
	/**
	 * Called when an entry is activated (double-click or Enter key).
	 * For files, this should open/execute. For directories, navigate into.
	 * Up-row always calls onGoUp on single-click.
	 */
	onEntryActivate?: (entry: FileEntry) => void;
	/**
	 * Called on single-click for directory rows/cards. Files keep using
	 * `onEntryClick` for single-click selection. When omitted, directory
	 * single-click remains a no-op (double-click/Enter still activates via
	 * `onEntryActivate`). Issue #142.
	 */
	onEntrySelect?: (entry: FileEntry) => void;
	selectionMode: FileEntrySelectionMode;
	isSelected: (entryPath: string, kind: FileEntryKind) => boolean;
	onToggleSelected: (entryPath: string, kind: FileEntryKind) => void;
	selectedSummary?: FileEntrySummary | null;
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
	 * owners pass the #65 shared hooks (or local state) down.  Defaults to
	 * the list layout.
	 */
	viewMode?: FileEntryViewMode;
	/**
	 * Called when the owner switches between the list and the icon grid.
	 * When it is omitted the kit renders no toggle, so a picker that only
	 * offers a list does not have to stub it.
	 */
	onViewModeChange?: (mode: FileEntryViewMode) => void;
	/**
	 * Grid zoom scale. Applied to the icon grid cell size as
	 * `cellBaseRem * scale`.
	 */
	scale?: number;
	/**
	 * Tile media shape. `"square"` renders the 4:3 media band,
	 * `"wide"` renders a 16:9 band.
	 */
	aspect?: FileEntryAspect;
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
	renderTile?: (entry: FileEntry) => {
		media: ReactNode;
		overlay?: ReactNode;
	};
	/**
	 * Owner-provided row content. Returns the row icon and optional
	 * trailing content (rendered after the checkboxes). Defaults to the
	 * shared entry-icon rendering.
	 */
	renderRow?: (entry: FileEntry) => {
		icon?: ReactNode;
		trailing?: ReactNode;
	};
	/**
	 * Sticky list header node rendered at the top of the list scroll area.
	 */
	listHeader?: ReactNode;
	footerExtra?: ReactNode;
};

/**
 * The row body is a shared `Button` in its `bare` variant: no chrome of its
 * own (no border, no fill, no bold text) - the row wrapper owns the
 * selected / active surfaces and the hover fill, exactly like the icon card
 * and the "up" tile own theirs.
 *
 * Only layout is left for this class.  The shared variant keeps the shared
 * focus ring and the shared size scale.
 */
const shellRowBtn = css({
	minWidth: 0,
	textAlign: "left",
});

const shellRowWrap = css({
	borderBottomWidth: "hairline",
	borderBottomStyle: "solid",
	borderBottomColor: "border.default",
	/**
	 * Hover fill of the row.  It lives on the outermost row element, so it
	 * paints *under* the selected / active surface of `rowInnerClass`
	 * instead of replacing it - a selected row therefore keeps its
	 * selection fill and merely lightens on hover.
	 */
	_hover: {
		backgroundColor:
			"color-mix(in oklab, var(--color-interactive-hover) 38%, transparent)",
	},
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
	/**
	 * A faint fill so the active row reads as a state, not just a stray
	 * separator — the 2px top accent alone was indistinguishable from the
	 * row border in the visual review.  Kept lighter than the selected
	 * fill (25%) so active-only stays visually subordinate to selection.
	 */
	backgroundColor:
		"color-mix(in oklab, var(--color-interactive-hover) 15%, transparent)",
	boxShadow: "inset 0 2px 0 0 var(--color-border-strong)",
});
/**
 * `isSelected` cue — the user toggled this row.  Match the visual
 * language used by `ListSelect` (interactive.hover surface) and add
 * a left-edge accent.  The accent is rendered as an inset box-shadow
 * rather than a border so it does not consume layout space and the
 * row height stays identical to an unselected row.
 *
 * The background fill is a 25% mix of `interactive.hover` and it sits on
 * the inner div, *above* the row's 38% hover mix (`shellRowWrap._hover`).
 * Because the fill is translucent, a selected row still lightens on hover
 * instead of darkening (review #148 inline) — the hover mix shows through
 * the 25% fill.  Selection itself remains clearly distinguished from an
 * unselected hover by the left accent.
 */
const rowInnerSelectedClass = css({
	backgroundColor:
		"color-mix(in oklab, var(--color-interactive-hover) 25%, transparent)",
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
		"color-mix(in oklab, var(--color-interactive-hover) 25%, transparent)",
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

/**
 * Wrapper around the row's selection checkbox.  The control itself is the
 * shared `Checkbox`; the wrapper only reserves the gutter so the rows
 * stay aligned.
 */
const checkboxWrapClass = css({
	display: "flex",
	flexShrink: 0,
	alignItems: "center",
	paddingInline: "1",
});

const iconBodyClass = css({
	display: "flex",
	minHeight: 0,
	minWidth: 0,
	flexDirection: "column",
	overflow: "hidden",
	borderRadius: "md",
	borderWidth: "hairline",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.dialog",
	height: "full",
});
/**
 * Scroll container for the icon grid.  The scrolling itself is delegated
 * to the shared `ScrollArea`; this class only keeps the grid cell
 * layout.
 */
const iconGridClass = css({
	display: "grid",
	gridAutoRows: "min",
	alignContent: "start",
	alignItems: "start",
	gap: "1",
	padding: "1.5",
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

/**
 * The "up" tile is a shared `Button` as well.  It keeps the tile look
 * (bordered column: media band above the label); the shared button's own
 * border / radius / hover values are the ones the tile wants, so only the
 * box layout is overridden here.
 */
/**
 * The "up" tile: a bordered container that owns the tile surface and the
 * hover fill, with a shared `bare` `Button` inside it — the same composite
 * shape as the icon card.
 */
const upTileClass = css({
	position: "relative",
	display: "flex",
	flexDirection: "column",
	alignItems: "stretch",
	alignSelf: "stretch",
	overflow: "hidden",
	borderRadius: "shell-sm",
	borderWidth: "hairline",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.dialog",
	transitionProperty: "colors",
	_hover: { backgroundColor: "interactive.hover" },
	minWidth: 0,
	maxWidth: "full",
});

/**
 * The tile body.  `height` and `paddingInline` are the two box metrics the
 * shared size scale would otherwise impose; a tile is sized by its media
 * band, so it cannot use the fixed control height.
 */
const upTileButtonClass = css({
	height: "auto",
	paddingInline: "0",
	flexDirection: "column",
	alignItems: "stretch",
	gap: "0",
	// `uiSize="sm"` sizes every descendant svg to 14px, which shrinks the
	// tile glyph inside the media band. `&&` doubles the class
	// specificity so this wins regardless of stylesheet order; `auto` lets
	// the glyph's own width/height attributes apply again, and the max
	// constraints keep it inside a smaller media band (#507, #554).
	"&& svg": { boxSize: "auto", maxWidth: "full", maxHeight: "full" },
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
	borderTopWidth: "hairline",
	borderTopStyle: "solid",
	borderTopColor: "border.default",
	paddingInline: "1",
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
	borderWidth: "hairline",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.dialog",
	overflow: "hidden",
	height: "full",
});
/**
 * Shared scroll container sizing for both view modes.  The scrolling
 * itself is delegated to the shared `ScrollArea`.
 */
const scrollAreaClass = css({
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
	borderBottomWidth: "hairline",
	borderBottomStyle: "solid",
	borderBottomColor: "border.default",
	backgroundColor:
		"color-mix(in oklab, var(--color-surface-widget) 50%, var(--color-surface-dialog))",
});
const listEmptyLabelClass = css({
	paddingInline: "2",
	paddingBlock: "3",
	fontSize: "shell-text-sm",
	color: "text.muted",
});

function mediaBandClass(aspect: FileEntryAspect): string {
	return cx(
		mediaBandBaseClass,
		aspect === "wide" ? mediaBandWideClass : mediaBandSquareClass,
	);
}

export const FileEntryList = ({
	entries,
	fileNameFilter,
	loading,
	canGoUp,
	onGoUp,
	onEntryClick,
	onEntryActivate,
	onEntrySelect,
	selectionMode,
	isSelected,
	onToggleSelected,
	selectedSummary = null,
	showSelectedSummary = true,
	emptyLabel = i18n.t("common:directoryBrowser.noFilesFound", {
		defaultValue: "No files found",
	}),
	loadingLabel = i18n.t("common:app.loading", { defaultValue: "Loading..." }),
	upLabel = "..",
	viewMode = "list",
	onViewModeChange,
	scale = 1,
	aspect = "square",
	cellBaseRem = 4,
	showViewToggle = true,
	activePath = null,
	renderTile,
	renderRow,
	listHeader,
	footerExtra,
}: FileEntryListProps) => {
	const displayedEntries: readonly FileEntry[] = fileNameFilter
		? entries.filter((e) =>
				e.isDirectory
					? true
					: fileNameFilter.some((ext) =>
							e.name.toLowerCase().endsWith(ext.toLowerCase()),
						),
			)
		: entries;

	const showFileCheckbox = (entry: FileEntry) =>
		!entry.isDirectory &&
		entry.path !== "" && // up-entry has empty path
		(selectionMode === "files" || selectionMode === "both");

	const showFolderCheckbox = (entry: FileEntry) =>
		entry.isDirectory &&
		entry.path !== "" && // up-entry has empty path
		(selectionMode === "folders" || selectionMode === "both");

	const showCheckbox = (entry: FileEntry) =>
		showFileCheckbox(entry) || showFolderCheckbox(entry);

	const handleRowClick = (entry: FileEntry) => {
		onEntryClick(entry);
	};

	// Up-row uses single-click to go up
	const handleUpRowClick = (): void => {
		onGoUp?.();
	};

	const handleRowActivate = (entry: FileEntry): void => {
		onEntryActivate?.(entry);
	};

	// Synthetic up-entry for normalized row rendering (up is always single-click)
	const previewEntry: FileEntry = {
		path: "",
		name: upLabel,
		isDirectory: true,
	};

	// Render a normalized list-mode row (shared by up-row and normal entries)
	const renderListRow = (
		entry: FileEntry,
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
					<Button
						type="button"
						variant="bare"
						uiSize="sm"
						data-directory-browser-entry=""
						data-entry-kind={entry.isDirectory ? "dir" : "file"}
						data-entry-path={entry.path}
						data-entry-file-type={fileEntryMenuFileType(entry)}
						className={cx(shellRowBtn, rowBtnFlex1Class)}
						onClick={
							isUpRow || !entry.isDirectory
								? entryOnClick
								: onEntrySelect
									? () => onEntrySelect(entry)
									: undefined
						}
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
								<FileEntryGlyph entry={entry} size={shellListIconSize} />
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
					</Button>
					{showFileCheckbox(entry) ? (
						<span className={checkboxWrapClass}>
							<Checkbox
								uiSize="md"
								data-directory-browser-entry-select=""
								data-entry-path={entry.path}
								data-multi-select="true"
								data-multi-select-path={entry.path}
								checked={isSelected(entry.path, "file")}
								onChange={() => onToggleSelected(entry.path, "file")}
								aria-label={i18n.t("common:directoryBrowser.selectFileAria", {
									name: entry.name,
									defaultValue: "Select file {{name}}",
								})}
							/>
						</span>
					) : null}
					{showFolderCheckbox(entry) ? (
						<span className={checkboxWrapClass}>
							<Checkbox
								uiSize="md"
								data-directory-browser-entry-select=""
								data-entry-path={entry.path}
								data-multi-select="true"
								data-multi-select-path={entry.path}
								checked={isSelected(entry.path, "folder")}
								onChange={() => onToggleSelected(entry.path, "folder")}
								aria-label={i18n.t("common:directoryBrowser.selectFolderAria", {
									name: entry.name,
									defaultValue: "Select folder {{name}}",
								})}
							/>
						</span>
					) : null}
					{renderRow?.(entry).trailing ?? null}
				</div>
			</div>
		);
	};

	const handleToggle =
		(entry: FileEntry) =>
		(event?: React.MouseEvent): void => {
			event?.stopPropagation();
			onToggleSelected(entry.path, kindOfEntry(entry));
		};

	// The footer (summary readout + view-mode toggle) is a shared kit
	// component so the kit owns that surface in exactly one place.
	const footer = (
		<FileEntryListFooter
			viewMode={viewMode}
			onViewModeChange={onViewModeChange}
			showSelectedSummary={showSelectedSummary}
			selectedSummary={selectedSummary}
			showViewToggle={showViewToggle}
			footerExtra={footerExtra}
		/>
	);

	// Icon view mode
	if (viewMode === "icons") {
		return (
			<div
				data-directory-browser-body=""
				className={cx(iconBodyClass, "ty-shell-directory-browser")}
			>
				<ScrollArea
					className={cx(scrollAreaClass, "ty-shell-directory-scroll")}
				>
					<div
						className={cx(iconGridClass, "grid")}
						data-directory-browser-grid=""
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
									<div className={upTileClass}>
										<Button
											type="button"
											variant="bare"
											uiSize="sm"
											className={upTileButtonClass}
											// `paddingInline` must be inline: the shared
											// `Button` base padding is a single-class rule
											// that wins the stylesheet cascade over
											// `upTileButtonClass` (#470, #554).
											style={{ paddingInline: 0 }}
											onClick={() => {
												onGoUp?.();
											}}
										>
											<div className={mediaBandClass(aspect)}>
												<div className={upIconInnerClass}>
													<Icon
														icon={FolderOpen}
														size={64}
														className={upIconSvgClass}
														aria-hidden
													/>
												</div>
											</div>
											<span className={upLabelClass}>{upLabel}</span>
										</Button>
									</div>
								) : null}
								{displayedEntries.length === 0 ? (
									<div className={emptyLabelClass}>{emptyLabel}</div>
								) : (
									displayedEntries.map((entry) => (
										<FileEntryCard
											key={entry.path}
											entry={entry}
											isSelected={isSelected(entry.path, kindOfEntry(entry))}
											onClick={() => handleRowClick(entry)}
											onDoubleClick={() => handleRowActivate(entry)}
											onSelect={
												onEntrySelect ? () => onEntrySelect(entry) : undefined
											}
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
				</ScrollArea>
				{footer}
			</div>
		);
	}
	return (
		<div
			data-directory-browser-body=""
			className={cx(listBodyClass, "ty-shell-directory-browser")}
		>
			<ScrollArea className={cx(scrollAreaClass, "ty-shell-directory-scroll")}>
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
			</ScrollArea>
			{footer}
		</div>
	);
};

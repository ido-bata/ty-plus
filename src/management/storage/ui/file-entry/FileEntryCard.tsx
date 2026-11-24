import { Button, Checkbox, cx } from "@ty-plus/ui";
import type { JSX, ReactNode } from "react";
import type { SiblingListingEntry } from "@/management/preset/sibling-thumbnail";
import { css } from "@/styled-system/css";
import {
	FileEntryGlyph,
	FileEntryMedia,
	hasFileEntryMedia,
} from "./FileEntryGlyph";
import type { FileEntry, FileEntryAspect } from "./FileEntryList";
import { fileEntryMenuFileType } from "./file-entry-menu";

export type FileEntryCardProps = {
	entry: FileEntry;
	isSelected: boolean;
	onClick: () => void;
	/**
	 * Single-click handler for directory cards (select/focus). Files keep
	 * using `onClick`. Issue #142.
	 */
	onSelect?: () => void;
	onDoubleClick: () => void;
	onToggle: (event?: React.MouseEvent) => void;
	showCheckbox: boolean;
	allEntries?: readonly SiblingListingEntry[];
	aspect: FileEntryAspect;
	renderTile?: (entry: FileEntry) => {
		media: ReactNode;
		overlay?: ReactNode;
	};
};

const cardBaseClass = css({
	position: "relative",
	display: "flex",
	height: "auto",
	flexDirection: "column",
	alignItems: "stretch",
	alignSelf: "stretch",
	overflow: "hidden",
	borderRadius: "shell-sm",
	borderWidth: "hairline",
	borderStyle: "solid",
	transitionProperty: "colors",
	minWidth: 0,
	maxWidth: "full",
});
/**
 * Selection cue — same surface language used by `ListSelect`'s selected
 * option (interactive.hover) plus a stronger border so the card pops
 * out of the icon grid.  No typography change: see `labelBaseClass`.
 *
 * `cardUnselectedClass._hover` lifts unselected cards to
 * `interactive.hover`.  Selected cards must not pick that up: the hover
 * would clobber the `surface.widget` selection fill and the user would
 * lose the visual distinction between "selected" and "hovered-unselected"
 * (review #148 inline).  The explicit `_hover` here keeps the selection
 * surface even if a shared hover rule is reintroduced upstream.
 */
const cardSelectedClass = css({
	borderColor: "border.strong",
	backgroundColor: "surface.widget",
	_hover: { backgroundColor: "surface.widget" },
	boxShadow: "inset 0 0 0 1px var(--color-border-strong)",
});
const cardUnselectedClass = css({
	borderColor: "border.default",
	backgroundColor: "surface.dialog",
	// Hover lift lives on the unselected variant only: a `_hover` rule on
	// the shared base would tie on specificity with the selected override
	// and lose on stylesheet order, stripping the selection surface.
	_hover: { backgroundColor: "interactive.hover" },
});

/**
 * The card body is a shared `Button` in its `bare` variant: the card
 * container owns the border, the surface and the hover fill, so the button
 * carries no chrome of its own.  The tile layout (a column of media band +
 * label) is all that is left for this class.
 *
 * `height` and `paddingInline` are the two box metrics the shared size
 * scale would otherwise impose; a tile is sized by its media band, so it
 * cannot use the fixed control height.
 */
const cardButtonClass = css({
	height: "auto",
	paddingInline: "0",
	// `uiSize="sm"` sizes every descendant svg to 14px, which shrinks the
	// tile fallback glyph inside the media band. `&&` doubles the class
	// specificity so this wins regardless of stylesheet order; `auto` lets
	// the glyph's own width/height attributes apply again, and the max
	// constraints keep a fixed-size glyph inside a smaller media band
	// instead of letting `overflow: hidden` clip it (#507).
	"&& svg": { boxSize: "auto", maxWidth: "full", maxHeight: "full" },
	flexDirection: "column",
	alignItems: "stretch",
	justifyContent: "flex-start",
	gap: "0",
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

const fallbackIconWrapClass = css({
	display: "flex",
	aspectRatio: "square",
	height: "70%",
	alignItems: "center",
	justifyContent: "center",
});

const labelBaseClass = css({
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
});
/**
 * Color-only change for selected tiles.  Selection is conveyed by the
 * card surface + border + box-shadow (see `cardSelectedClass`); the
 * label itself must not change weight — that would change the rendered
 * glyph width and bump neighbour rows.
 */
const labelSelectedClass = css({
	color: "text.primary",
});
const labelUnselectedClass = css({
	color: "text.muted",
});

/**
 * The selection checkbox is a shared `Checkbox`: a native, focusable
 * control that is keyboard-operable on its own.  It is positioned over
 * the tile media band, so it stays a *sibling* of the card button rather
 * than a descendant — interactive content must not live inside a button.
 */
const checkboxClass = css({
	position: "absolute",
	top: "1",
	right: "1",
	zIndex: "var(--ty-z-overlay)",
});

function cardClass(isSelected: boolean): string {
	return cx(
		cardBaseClass,
		isSelected ? cardSelectedClass : cardUnselectedClass,
	);
}

function labelClass(isSelected: boolean): string {
	return cx(
		labelBaseClass,
		isSelected ? labelSelectedClass : labelUnselectedClass,
	);
}

function mediaBandClass(aspect: FileEntryAspect): string {
	return cx(
		mediaBandBaseClass,
		aspect === "wide" ? mediaBandWideClass : mediaBandSquareClass,
	);
}

export function FileEntryCard({
	entry,
	isSelected,
	onClick,
	onSelect,
	onDoubleClick,
	onToggle,
	showCheckbox,
	allEntries,
	aspect,
	renderTile,
}: FileEntryCardProps): JSX.Element {
	const tileContent = renderTile?.(entry);
	const iconSize = 64;
	const fallback = (
		<div className={fallbackIconWrapClass}>
			<FileEntryGlyph
				entry={entry}
				size={iconSize}
				allEntries={allEntries}
				fill
			/>
		</div>
	);
	// `FileEntryMedia` renders `null` for entries without media, but the JSX
	// element itself is always truthy — `??` cannot detect that, so gate on
	// `hasFileEntryMedia` or `.ffx`-style cards keep a blank media band.
	const mediaPreview: JSX.Element | null =
		!entry.isDirectory && hasFileEntryMedia(entry) ? (
			<FileEntryMedia entry={entry} fallback={fallback} />
		) : null;

	return (
		<div
			className={cardClass(isSelected)}
			data-card-selected={isSelected ? "true" : "false"}
		>
			<Button
				type="button"
				variant="bare"
				uiSize="sm"
				data-directory-browser-entry=""
				data-entry-kind={entry.isDirectory ? "dir" : "file"}
				data-entry-path={entry.path}
				data-entry-file-type={fileEntryMenuFileType(entry)}
				className={cardButtonClass}
				// `paddingInline` must be inline: the shared `Button` base
				// padding is a single-class rule that wins the stylesheet
				// cascade over `cardButtonClass` (#470).
				style={{ paddingInline: 0 }}
				onClick={entry.isDirectory ? onSelect : onClick}
				onDoubleClick={onDoubleClick}
			>
				<div className={mediaBandClass(aspect)} data-media-band>
					{tileContent?.media ?? mediaPreview ?? fallback}
				</div>
				<span className={labelClass(isSelected)} title={entry.name}>
					{entry.name}
				</span>
			</Button>
			{tileContent?.overlay ?? null}
			{showCheckbox ? (
				<Checkbox
					uiSize="sm"
					className={checkboxClass}
					data-directory-browser-entry-select=""
					data-entry-path={entry.path}
					data-multi-select="true"
					data-multi-select-path={entry.path}
					checked={isSelected}
					onChange={() => {
						onToggle();
					}}
					aria-label={`select ${entry.name}`}
				/>
			) : null}
		</div>
	);
}

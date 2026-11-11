import type { JSX, ReactNode } from "react";
import type { SiblingListingEntry } from "@/management/preset/sibling-thumbnail";
import { cx } from "@/shared/util/cx";
import { css } from "@/styled-system/css";
import type {
	DirectoryBrowserAspect,
	DirectoryBrowserEntry,
} from "./DirectoryBrowser";
import {
	EntryIcon,
	MediaCardContent,
} from "./DirectoryBrowserShell.entry-icon";

export type DirectoryBrowserIconCardProps = {
	entry: DirectoryBrowserEntry;
	isSelected: boolean;
	onClick: () => void;
	onDoubleClick: () => void;
	onToggle: (event?: React.MouseEvent) => void;
	showCheckbox: boolean;
	allEntries?: readonly SiblingListingEntry[];
	aspect: DirectoryBrowserAspect;
	renderTile?: (entry: DirectoryBrowserEntry) => {
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
	borderWidth: "1px",
	borderStyle: "solid",
	transitionProperty: "colors",
	_hover: { backgroundColor: "interactive.hover" },
	minWidth: 0,
	maxWidth: "full",
});
/**
 * Selection cue — same surface language used by `ListSelect`'s selected
 * option (interactive.hover) plus a stronger border so the card pops
 * out of the icon grid.  No typography change: see `labelBaseClass`.
 *
 * `cardBaseClass._hover` always paints `interactive.hover` so an
 * unselected card lifts on hover.  When the card is *also* selected,
 * the hover would clobber the `surface.widget` selection fill and the
 * user would lose the visual distinction between "selected" and
 * "hovered-unselected" (review #148 inline).  Override `_hover` here
 * so a selected card keeps its surface on hover and the selection
 * cue (border + box-shadow) stays the dominant signal.
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
});

const cardButtonClass = css({
	display: "flex",
	width: "full",
	flexDirection: "column",
	alignItems: "stretch",
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
	borderTopWidth: "1px",
	borderTopStyle: "solid",
	borderTopColor: "border.default",
	paddingInline: "2",
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

const checkboxLabelClass = css({
	position: "absolute",
	top: "1",
	right: "1",
	zIndex: 10,
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	cursor: "pointer",
});
const checkboxClass = css({
	pointerEvents: "none",
	height: "3.5",
	width: "3.5",
	borderRadius: "sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.widget",
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

function mediaBandClass(aspect: DirectoryBrowserAspect): string {
	return cx(
		mediaBandBaseClass,
		aspect === "wide" ? mediaBandWideClass : mediaBandSquareClass,
	);
}

export function DirectoryBrowserIconCard({
	entry,
	isSelected,
	onClick,
	onDoubleClick,
	onToggle,
	showCheckbox,
	allEntries,
	aspect,
	renderTile,
}: DirectoryBrowserIconCardProps): JSX.Element {
	const tileContent = renderTile?.(entry);
	const mediaPreview: JSX.Element | null = !entry.isDirectory ? (
		<MediaCardContent entry={entry} />
	) : null;
	const iconSize = 64;

	return (
		<div
			className={cardClass(isSelected)}
			data-card-selected={isSelected ? "true" : "false"}
		>
			<button
				type="button"
				data-directory-browser-entry=""
				data-entry-kind={entry.isDirectory ? "dir" : "file"}
				data-entry-path={entry.path}
				className={cardButtonClass}
				onClick={entry.isDirectory ? undefined : onClick}
				onDoubleClick={onDoubleClick}
			>
				<div className={mediaBandClass(aspect)}>
					{tileContent?.media ?? mediaPreview ?? (
						<div className={fallbackIconWrapClass}>
							<EntryIcon
								entry={entry}
								size={iconSize}
								allEntries={allEntries}
								fill
							/>
						</div>
					)}
				</div>
				<span className={labelClass(isSelected)} title={entry.name}>
					{entry.name}
				</span>
			</button>
			{tileContent?.overlay ?? null}
			{showCheckbox ? (
				<label
					className={checkboxLabelClass}
					onClick={(event: React.MouseEvent) => {
						// Dedupe the label-input synthetic click that real
						// Chromium dispatches (see DirectoryBrowser IconCard).
						if (event.target !== event.currentTarget) return;
						onToggle(event);
					}}
					onKeyDown={(e) => {
						if (e.key === "Enter" || e.key === " ") {
							e.preventDefault();
							e.stopPropagation();
							onToggle();
						}
					}}
				>
					<input
						type="checkbox"
						data-directory-browser-entry-select=""
						data-entry-path={entry.path}
						data-multi-select="true"
						data-multi-select-path={entry.path}
						className={checkboxClass}
						checked={isSelected}
						readOnly
						aria-label={`select ${entry.name}`}
					/>
				</label>
			) : null}
		</div>
	);
}

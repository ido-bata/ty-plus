import type { JSX, MouseEvent, RefObject } from "react";
import type { PresetType } from "@/management/preset/contract";
import { AnchoredPopover } from "@/shared/component/interaction/AnchoredPopover";
import { css } from "@/styled-system/css";
import { EffectRow, PresetRow, RootFileRow } from "./row-components";
import type { ScoredPaletteRow, ThumbnailListDirectory } from "./types";

type PaletteRowsListProps = {
	paletteRows: ScoredPaletteRow[];
	clampedActiveIdx: number;
	widgetInstanceId: string;
	t: (key: string) => string;
	typeLabel: (ty: PresetType) => string;
	thumbnailListDirectory?: ThumbnailListDirectory;
	onSelect: (idx: number) => void;
};

function PaletteRowsList({
	paletteRows,
	clampedActiveIdx,
	widgetInstanceId,
	t,
	typeLabel,
	thumbnailListDirectory,
	onSelect,
}: PaletteRowsListProps): JSX.Element {
	return (
		<>
			{paletteRows.map((row, idx) => {
				const selected = idx === clampedActiveIdx;
				if (row.kind === "effect") {
					return (
						<EffectRow
							key={`${widgetInstanceId}-fx-${row.effect.matchName}`}
							effect={row.effect}
							idx={idx}
							selected={selected}
							widgetInstanceId={widgetInstanceId}
							t={t}
							onSelect={onSelect}
						/>
					);
				}
				if (row.kind === "rootFile") {
					return (
						<RootFileRow
							key={`${widgetInstanceId}-rf-${row.rootFile.filePath}`}
							rootFile={row.rootFile}
							idx={idx}
							selected={selected}
							widgetInstanceId={widgetInstanceId}
							t={t}
							typeLabel={typeLabel}
							onSelect={onSelect}
						/>
					);
				}
				const tl = typeLabel(row.preset.type);
				return (
					<PresetRow
						key={`${widgetInstanceId}-p-${row.preset.id}`}
						preset={row.preset}
						idx={idx}
						selected={selected}
						widgetInstanceId={widgetInstanceId}
						tl={tl}
						thumbnailListDirectory={thumbnailListDirectory}
						onSelect={onSelect}
					/>
				);
			})}
		</>
	);
}

/**
 * Surface styling for the portaled palette. Placement (position, flip,
 * viewport clamp, dismissal) is owned by `AnchoredPopover`; this class must
 * not set `position` / `top` / `left` / `zIndex` / `maxHeight`.
 */
const paletteSurfaceClass = css({
	pointerEvents: "auto",
	minWidth: "10rem",
	maxWidth: "calc(100vw - 0.75rem)",
	overflow: "auto",
	borderRadius: "var(--ty-space-1)",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.widget",
	boxShadow: "control-panel",
});

const emptyRowClass = css({
	paddingInline: "var(--ty-space-2)",
	paddingBlock: "var(--ty-space-2)",
	fontSize: "text-xs",
	color: "text.muted",
});

export type PaletteDropdownProps = {
	open: boolean;
	/** Element the dropdown is anchored to (the search field container). */
	anchorRef: RefObject<HTMLElement | null>;
	onClose: () => void;
	/**
	 * Ref forwarded to a wrapper inside the popover. Consumers use it for
	 * focus-containment checks and delegated activation listeners; clicks
	 * inside the popover bubble to it.
	 */
	portalRef: RefObject<HTMLDivElement | null>;
	listRef: RefObject<HTMLDivElement | null>;
	paletteRows: ScoredPaletteRow[];
	clampedActiveIdx: number;
	widgetInstanceId: string;
	t: (key: string) => string;
	typeLabel: (ty: PresetType) => string;
	thumbnailListDirectory?: ThumbnailListDirectory;
	instanceAttr: Record<string, string | undefined>;
	onSelect: (idx: number) => void;
	onPaletteMouseDown: (ev: MouseEvent) => void;
};

export function PaletteDropdown({
	open,
	anchorRef,
	onClose,
	portalRef,
	listRef,
	paletteRows,
	clampedActiveIdx,
	widgetInstanceId,
	t,
	typeLabel,
	thumbnailListDirectory,
	instanceAttr,
	onSelect,
	onPaletteMouseDown,
}: PaletteDropdownProps): JSX.Element | null {
	if (!open || typeof document === "undefined") return null;
	return (
		<AnchoredPopover
			open={open}
			onClose={onClose}
			anchorRef={anchorRef}
			matchAnchorWidth
			maxHeight="22rem"
			zIndex={100000}
			className={paletteSurfaceClass}
		>
			<div ref={portalRef} {...instanceAttr}>
				<div ref={listRef} role="presentation" onMouseDown={onPaletteMouseDown}>
					{paletteRows.length === 0 ? (
						<div className={emptyRowClass}>
							{t("quickActions.paletteEmpty")}
						</div>
					) : (
						<PaletteRowsList
							paletteRows={paletteRows}
							clampedActiveIdx={clampedActiveIdx}
							widgetInstanceId={widgetInstanceId}
							t={t}
							typeLabel={typeLabel}
							thumbnailListDirectory={thumbnailListDirectory}
							onSelect={onSelect}
						/>
					)}
				</div>
			</div>
		</AnchoredPopover>
	);
}

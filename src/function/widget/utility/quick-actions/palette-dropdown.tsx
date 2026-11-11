import type { JSX, MouseEvent, RefObject } from "react";
import { createPortal } from "react-dom";
import type { PresetType } from "@/management/preset/contract";
import { css } from "@/styled-system/css";
import { EffectRow, PresetRow, RootFileRow } from "./row-components";
import type { ScoredPaletteRow } from "./types";

type PaletteRowsListProps = {
	paletteRows: ScoredPaletteRow[];
	clampedActiveIdx: number;
	widgetInstanceId: string;
	t: (key: string) => string;
	typeLabel: (ty: PresetType) => string;
	onSelect: (idx: number) => void;
};

function PaletteRowsList({
	paletteRows,
	clampedActiveIdx,
	widgetInstanceId,
	t,
	typeLabel,
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
						onSelect={onSelect}
					/>
				);
			})}
		</>
	);
}

export type PaletteDropdownProps = {
	open: boolean;
	portalRef: RefObject<HTMLDivElement | null>;
	listRef: RefObject<HTMLDivElement | null>;
	paletteRows: ScoredPaletteRow[];
	clampedActiveIdx: number;
	widgetInstanceId: string;
	dropdownBox: { top: number; left: number; width: number };
	t: (key: string) => string;
	typeLabel: (ty: PresetType) => string;
	instanceAttr: Record<string, string | undefined>;
	onSelect: (idx: number) => void;
	onPaletteMouseDown: (ev: MouseEvent) => void;
};

export function PaletteDropdown({
	open,
	portalRef,
	listRef,
	paletteRows,
	clampedActiveIdx,
	widgetInstanceId,
	dropdownBox,
	t,
	typeLabel,
	instanceAttr,
	onSelect,
	onPaletteMouseDown,
}: PaletteDropdownProps): JSX.Element | null {
	if (!open || typeof document === "undefined") return null;
	return createPortal(
		<div
			ref={portalRef}
			className={css({
				pointerEvents: "auto",
				zIndex: 100000,
				maxHeight: "min(50vh,22rem)",
				overflow: "hidden",
				borderRadius: "var(--ty-space-1)",
				borderWidth: "1px",
				borderStyle: "solid",
				borderColor: "border.default",
				backgroundColor: "surface.widget",
				boxShadow: "control-panel",
			})}
			style={{
				position: "fixed",
				top: dropdownBox.top,
				left: dropdownBox.left,
				width: Math.max(dropdownBox.width, 160),
				maxWidth: "calc(100vw - 12px)",
			}}
			{...instanceAttr}
		>
			<div
				ref={listRef}
				role="presentation"
				className={css({ maxHeight: "min(50vh,22rem)", overflow: "auto" })}
				onMouseDown={onPaletteMouseDown}
			>
				{paletteRows.length === 0 ? (
					<div
						className={css({
							paddingInline: "var(--ty-space-2)",
							paddingBlock: "var(--ty-space-2)",
							fontSize: "text-xs",
							color: "text.muted",
						})}
					>
						{t("quickActions.paletteEmpty")}
					</div>
				) : (
					<PaletteRowsList
						paletteRows={paletteRows}
						clampedActiveIdx={clampedActiveIdx}
						widgetInstanceId={widgetInstanceId}
						t={t}
						typeLabel={typeLabel}
						onSelect={onSelect}
					/>
				)}
			</div>
		</div>,
		document.body,
	);
}

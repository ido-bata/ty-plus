import type { JSX, ReactNode } from "react";
import type { Preset } from "@/management/preset/contract";
import { dispatchWorkspacePresetHover } from "@/management/preset/group/hover";
import type { GroupPanelFrame } from "@/management/preset/group/panel-layout";
import { Tile } from "@/management/preset/workspace/Tile";
import type { GridSettings } from "@/management/workspace/layout/grid-document";
import { ATTR_GROUP_PANEL } from "@/management/workspace/placement/types";
import { css, cx } from "@/styled-system/css";
import { useGroupPanelDrag } from "./use-group-panel-drag";

const ATTR_GROUP_PANEL_ITEM = "data-workspace-group-panel-item";

const gridCellOuterClass = css({
	position: "relative",
	boxSizing: "border-box",
	flexShrink: "0",
	borderRadius: "shell-sm",
	backgroundColor: "surface.widget",
	color: "text.primary",
});

const gridCellInnerClass = css({
	position: "absolute",
	inset: "0",
	zIndex: "0",
	minHeight: "0",
	minWidth: "0",
	overflow: "hidden",
	borderRadius: "shell-sm",
});

const gridCellRingBaseClass = css({
	pointerEvents: "none",
	position: "absolute",
	inset: "0",
	zIndex: "1",
	boxSizing: "border-box",
	borderRadius: "shell-sm",
	transitionProperty: "border-color",
	transitionDuration: "100ms",
	transitionTimingFunction: "ease-out",
});

const gridCellRingBorderClass = css({
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "var(--color-ty-ws-gridcell-ring-border)",
});

const panelClass = css({
	position: "absolute",
	zIndex: "120",
	boxSizing: "border-box",
	overflowX: "hidden",
	overflowY: "auto",
	borderRadius: "shell-sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.widget",
	color: "text.primary",
});

const gridClass = css({
	marginLeft: "auto",
	marginRight: "auto",
	display: "grid",
	justifyContent: "center",
});

const cellButtonClass = css({
	display: "block",
	flexShrink: "0",
	cursor: "pointer",
	userSelect: "none",
	borderWidth: "0",
	backgroundColor: "transparent",
	padding: "0",
	_disabled: {
		cursor: "not-allowed",
		opacity: "0.5",
	},
});

const dragGhostClass = css({
	pointerEvents: "none",
	position: "fixed",
	zIndex: "200",
	opacity: "0.9",
});

const srOnlyClass = css({
	position: "absolute",
	width: "1px",
	height: "1px",
	padding: "0",
	margin: "-1px",
	overflow: "hidden",
	clip: "rect(0,0,0,0)",
	whiteSpace: "nowrap",
	borderWidth: "0",
});

function GroupPanelPresetCell({
	cellSizePx,
	children,
}: {
	cellSizePx: number;
	children: ReactNode;
}): JSX.Element {
	return (
		<div
			className={gridCellOuterClass}
			style={{ width: cellSizePx, height: cellSizePx }}
		>
			<div className={gridCellInnerClass}>{children}</div>
			<div
				aria-hidden
				className={cx(gridCellRingBaseClass, gridCellRingBorderClass)}
			/>
		</div>
	);
}

export function GroupPanel({
	groupId,
	groupName,
	memberPresets,
	presetsById,
	frame,
	layoutLocked,
	grid,
	onRunPreset,
	panelId,
}: {
	groupId: string;
	groupName: string;
	memberPresets: readonly { id: string; label: string }[];
	presetsById: ReadonlyMap<string, Preset>;
	frame: GroupPanelFrame;
	layoutLocked: boolean;
	panelRoot: HTMLElement | null;
	grid: GridSettings;
	onRunPreset?: (preset: Preset) => void;
	panelId: string;
}): JSX.Element {
	const cellSizePx = grid.cellSize;
	const gapPx = grid.gap;
	const {
		groupDrag,
		orderedMemberPresets,
		gridRef,
		beginGroupDrag,
		clickSuppressedRef,
	} = useGroupPanelDrag({
		groupId,
		memberPresets,
		layoutLocked,
		cellSizePx,
		gapPx,
		memberGridCols: frame.memberGridCols,
		grid,
		panelId,
	});

	return (
		<div
			{...{ [ATTR_GROUP_PANEL]: "" }}
			data-group-id={groupId}
			className={panelClass}
			style={{
				left: frame.left,
				top: frame.top,
				width: frame.width,
				height: frame.height,
				padding: gapPx,
				backgroundColor: "var(--ty-surface-widget, var(--color-ty-widget-bg))",
			}}
			onPointerDown={(e) => e.stopPropagation()}
			onMouseDown={(e) => e.stopPropagation()}
		>
			<div
				ref={gridRef}
				className={gridClass}
				style={{
					gridTemplateColumns: `repeat(${Math.max(1, frame.memberGridCols)}, ${cellSizePx}px)`,
					gap: gapPx,
					width: frame.innerWidthPx,
				}}
			>
				{orderedMemberPresets.map((meta, index) => {
					const preset = presetsById.get(meta.id);
					return (
						<button
							key={meta.id}
							type="button"
							{...{ [ATTR_GROUP_PANEL_ITEM]: "" }}
							data-preset-id={meta.id}
							className={cellButtonClass}
							style={{
								width: cellSizePx,
								height: cellSizePx,
								opacity: groupDrag?.presetId === meta.id ? 0 : 1,
							}}
							disabled={layoutLocked}
							onPointerDown={(e) => beginGroupDrag(e, meta, index)}
							onMouseDown={(e) => beginGroupDrag(e, meta, index)}
							onClick={() => {
								if (clickSuppressedRef.current) return;
								if (preset) onRunPreset?.(preset);
							}}
						>
							<GroupPanelPresetCell cellSizePx={cellSizePx}>
								<Tile
									preset={preset}
									label={meta.label}
									onHoverChange={dispatchWorkspacePresetHover}
								/>
							</GroupPanelPresetCell>
						</button>
					);
				})}
				{groupDrag ? (
					<div
						className={dragGhostClass}
						style={{
							left: groupDrag.lastX - groupDrag.offsetX,
							top: groupDrag.lastY - groupDrag.offsetY,
							width: cellSizePx,
							height: cellSizePx,
						}}
					>
						<GroupPanelPresetCell cellSizePx={cellSizePx}>
							<Tile
								preset={presetsById.get(groupDrag.presetId)}
								label={
									memberPresets.find((p) => p.id === groupDrag.presetId)
										?.label ?? groupDrag.presetId
								}
							/>
						</GroupPanelPresetCell>
					</div>
				) : null}
			</div>
			<span className={srOnlyClass}>{groupName}</span>
		</div>
	);
}

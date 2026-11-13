import {
	type JSX,
	type MouseEvent as ReactMouseEvent,
	type ReactNode,
	type PointerEvent as ReactPointerEvent,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type { Preset } from "@/management/preset/contract";
import { dispatchWorkspacePresetHover } from "@/management/preset/group/hover";
import type { GroupPanelFrame } from "@/management/preset/group/panel-layout";
import {
	removePresetFromGroupEntry,
	reorderPresetInGroupEntry,
} from "@/management/preset/group-catalog";
import { Tile } from "@/management/preset/workspace/Tile";
import type { GridSettings } from "@/management/workspace/layout/grid-document";
import { gridClientPointToCell } from "@/management/workspace/placement/grid-coords";
import { notifyPanelsAfterPresetSave } from "@/management/workspace/placement/notify-panels-after-preset-save";
import {
	ATTR_GRID,
	ATTR_GROUP_PANEL,
} from "@/management/workspace/placement/types";
import { css, cx } from "@/styled-system/css";

const ATTR_GROUP_PANEL_ITEM = "data-workspace-group-panel-item";
/** Window for treating a mouse event as the twin of a pointer event. */
const POINTER_MOUSE_DEDUP_MS = 16;

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

type GroupDragState = {
	presetId: string;
	startIndex: number;
	overIndex: number;
	lastX: number;
	lastY: number;
	offsetX: number;
	offsetY: number;
};

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
	const gridRef = useRef<HTMLDivElement | null>(null);
	const dragMovedRef = useRef(false);
	const suppressClickRef = useRef(false);
	const lastPointerTsRef = useRef({ down: 0, move: 0, up: 0 });
	const [groupDrag, setGroupDrag] = useState<GroupDragState | null>(null);

	const orderedMemberPresets = useMemo(() => {
		if (!groupDrag) return memberPresets;
		const next = [...memberPresets];
		const [item] = next.splice(groupDrag.startIndex, 1);
		if (!item) return memberPresets;
		next.splice(groupDrag.overIndex, 0, item);
		return next;
	}, [groupDrag, memberPresets]);

	// Shared by onPointerDown and onMouseDown: CEP/CEF paths that never
	// deliver pointerdown still deliver mousedown for the same press.
	const beginGroupDrag = (
		e:
			| ReactPointerEvent<HTMLButtonElement>
			| ReactMouseEvent<HTMLButtonElement>,
		meta: { id: string; label: string },
		index: number,
	): void => {
		if (layoutLocked) return;
		const isMoveClick =
			e.button === 1 || (e.button === 0 && (e.ctrlKey || e.metaKey));
		if (!isMoveClick) return;
		e.preventDefault();
		e.stopPropagation();
		dragMovedRef.current = false;
		const rect = e.currentTarget.getBoundingClientRect();
		setGroupDrag({
			presetId: meta.id,
			startIndex: memberPresets.findIndex((p) => p.id === meta.id),
			overIndex: index,
			lastX: e.clientX,
			lastY: e.clientY,
			offsetX: e.clientX - rect.left,
			offsetY: e.clientY - rect.top,
		});
	};

	useEffect(() => {
		if (!groupDrag) return;

		// Some CEP/CEF input paths synthesize pointermove but never deliver
		// pointerdown/pointerup, so accept mouse events as fallback and skip
		// the twin of any pointer event that arrived within the same gesture.
		const onPointerMove = (event: PointerEvent | MouseEvent): void => {
			if (event.type === "pointermove") {
				lastPointerTsRef.current.move = event.timeStamp;
			} else if (
				event.timeStamp - lastPointerTsRef.current.move <
				POINTER_MOUSE_DEDUP_MS
			) {
				return;
			}
			const dx = event.clientX - groupDrag.lastX;
			const dy = event.clientY - groupDrag.lastY;
			if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
				dragMovedRef.current = true;
			}

			let nextOver = groupDrag.overIndex;
			const gridEl = gridRef.current;
			if (gridEl) {
				const rect = gridEl.getBoundingClientRect();
				const localX = event.clientX - rect.left + gridEl.scrollLeft;
				const localY = event.clientY - rect.top + gridEl.scrollTop;
				if (localX >= 0 && localY >= 0) {
					const col = Math.max(
						0,
						Math.min(
							Math.max(1, frame.memberGridCols) - 1,
							Math.floor(localX / (cellSizePx + gapPx)),
						),
					);
					const row = Math.max(0, Math.floor(localY / (cellSizePx + gapPx)));
					const idx = row * Math.max(1, frame.memberGridCols) + col;
					nextOver = Math.min(idx, Math.max(0, memberPresets.length - 1));
				}
			}

			setGroupDrag((prev) =>
				prev
					? {
							...prev,
							overIndex: nextOver,
							lastX: event.clientX,
							lastY: event.clientY,
						}
					: prev,
			);
		};

		const onPointerUp = (event: PointerEvent | MouseEvent): void => {
			if (event.type === "pointerup") {
				lastPointerTsRef.current.up = event.timeStamp;
			} else if (
				event.timeStamp - lastPointerTsRef.current.up <
				POINTER_MOUSE_DEDUP_MS
			) {
				return;
			}
			void (async () => {
				if (dragMovedRef.current) {
					suppressClickRef.current = true;
					window.setTimeout(() => {
						suppressClickRef.current = false;
					}, 0);
				}

				const gridEl = gridRef.current;
				const droppedInside =
					gridEl !== null &&
					event.clientX >= gridEl.getBoundingClientRect().left &&
					event.clientX <= gridEl.getBoundingClientRect().right &&
					event.clientY >= gridEl.getBoundingClientRect().top &&
					event.clientY <= gridEl.getBoundingClientRect().bottom;

				if (droppedInside) {
					await reorderPresetInGroupEntry(
						window,
						groupId,
						groupDrag.startIndex,
						groupDrag.overIndex,
					);
					await notifyPanelsAfterPresetSave(window, {
						sourceSurfaceId: panelId,
						catalogRefIds: [groupId],
					});
				} else {
					await removePresetFromGroupEntry(window, groupId, groupDrag.presetId);
					const workspaceGrid =
						gridRef.current?.closest<HTMLElement>(`[${ATTR_GRID}]`) ?? null;
					const dropPlacement = gridClientPointToCell(
						event.clientX,
						event.clientY,
						workspaceGrid,
						grid,
					);
					await notifyPanelsAfterPresetSave(window, {
						sourceSurfaceId: panelId,
						catalogRefIds: [groupDrag.presetId],
						dropPlacement: dropPlacement ?? undefined,
					});
				}

				dragMovedRef.current = false;
				setGroupDrag(null);
			})();
		};

		window.addEventListener("pointermove", onPointerMove);
		window.addEventListener("pointerup", onPointerUp);
		window.addEventListener("mousemove", onPointerMove);
		window.addEventListener("mouseup", onPointerUp);
		return () => {
			window.removeEventListener("pointermove", onPointerMove);
			window.removeEventListener("pointerup", onPointerUp);
			window.removeEventListener("mousemove", onPointerMove);
			window.removeEventListener("mouseup", onPointerUp);
		};
	}, [
		cellSizePx,
		frame.memberGridCols,
		gapPx,
		grid,
		groupDrag,
		groupId,
		memberPresets,
		panelId,
	]);

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
							onPointerDown={(e) => {
								lastPointerTsRef.current.down = e.timeStamp;
								beginGroupDrag(e, meta, index);
							}}
							onMouseDown={(e) => {
								if (
									e.timeStamp - lastPointerTsRef.current.down <
									POINTER_MOUSE_DEDUP_MS
								) {
									// The pointerdown twin already ran; keep the
									// legacy suppression without restarting.
									if (!layoutLocked) {
										const isMoveClick =
											e.button === 1 ||
											(e.button === 0 && (e.ctrlKey || e.metaKey));
										if (isMoveClick) {
											e.preventDefault();
											e.stopPropagation();
										}
									}
									return;
								}
								beginGroupDrag(e, meta, index);
							}}
							onClick={() => {
								if (suppressClickRef.current) return;
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

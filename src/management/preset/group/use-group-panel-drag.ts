import {
	type MouseEvent as ReactMouseEvent,
	type PointerEvent as ReactPointerEvent,
	type RefObject,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	removePresetFromGroupEntry,
	reorderPresetInGroupEntry,
} from "@/management/preset/group-catalog";
import type { GridSettings } from "@/management/workspace/layout/grid-document";
import { gridClientPointToCell } from "@/management/workspace/placement/grid-coords";
import { notifyPanelsAfterPresetSave } from "@/management/workspace/placement/notify-panels-after-preset-save";
import { ATTR_GRID } from "@/management/workspace/placement/types";

/**
 * Drag-out / reorder gesture for presets inside a group panel.
 *
 * Extracted from `Panel.tsx` so the panel component stays under the
 * react-doctor giant-component threshold. Some CEP/CEF input paths never
 * deliver pointerdown/pointerup (only pointermove is synthesized), so the
 * move/end listeners accept mouse events as fallback and deduplicate the
 * pointer/mouse twin by timestamp.
 */

export type GroupPanelMember = { id: string; label: string };

export type GroupDragState = {
	presetId: string;
	startIndex: number;
	overIndex: number;
	lastX: number;
	lastY: number;
	offsetX: number;
	offsetY: number;
};

export type GroupDragEvent =
	| ReactPointerEvent<HTMLButtonElement>
	| ReactMouseEvent<HTMLButtonElement>;

/** Window for treating a mouse event as the twin of a pointer event. */
const POINTER_MOUSE_DEDUP_MS = 16;

const isMoveClickEvent = (e: GroupDragEvent): boolean =>
	e.button === 1 || (e.button === 0 && (e.ctrlKey || e.metaKey));

export function useGroupPanelDrag({
	groupId,
	memberPresets,
	layoutLocked,
	cellSizePx,
	gapPx,
	memberGridCols,
	grid,
	panelId,
}: {
	groupId: string;
	memberPresets: readonly GroupPanelMember[];
	layoutLocked: boolean;
	cellSizePx: number;
	gapPx: number;
	memberGridCols: number;
	grid: GridSettings;
	panelId: string;
}): {
	groupDrag: GroupDragState | null;
	orderedMemberPresets: readonly GroupPanelMember[];
	gridRef: RefObject<HTMLDivElement | null>;
	beginGroupDrag: (
		e: GroupDragEvent,
		meta: GroupPanelMember,
		index: number,
	) => void;
	clickSuppressedRef: RefObject<boolean>;
} {
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
	// deliver pointerdown still deliver mousedown for the same press. The
	// mouse twin of a pointer press keeps the legacy suppression without
	// restarting the gesture.
	const beginGroupDrag = (
		e: GroupDragEvent,
		meta: GroupPanelMember,
		index: number,
	): void => {
		if (e.nativeEvent.type === "pointerdown") {
			lastPointerTsRef.current.down = e.timeStamp;
		} else if (
			e.timeStamp - lastPointerTsRef.current.down <
			POINTER_MOUSE_DEDUP_MS
		) {
			if (!layoutLocked && isMoveClickEvent(e)) {
				e.preventDefault();
				e.stopPropagation();
			}
			return;
		}
		if (layoutLocked) return;
		if (!isMoveClickEvent(e)) return;
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
							Math.max(1, memberGridCols) - 1,
							Math.floor(localX / (cellSizePx + gapPx)),
						),
					);
					const row = Math.max(0, Math.floor(localY / (cellSizePx + gapPx)));
					const idx = row * Math.max(1, memberGridCols) + col;
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
		memberGridCols,
		gapPx,
		grid,
		groupDrag,
		groupId,
		memberPresets,
		panelId,
	]);

	return {
		groupDrag,
		orderedMemberPresets,
		gridRef,
		beginGroupDrag,
		clickSuppressedRef: suppressClickRef,
	};
}

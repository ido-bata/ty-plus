import {
	ALIGN_ACTIONS,
	buildAlignLayersScript,
	buildTimeAlignScript,
	TIME_ALIGN_ACTIONS,
} from "@/function/widget/core/align";
import {
	buildAnchorScript,
	isValidAnchorPosition,
} from "@/function/widget/core/anchor-point";
import { createCepHostExecutor } from "@/management/ae/cep/host-executor";
import type { Preset } from "@/management/preset/contract";
import { dispatchGroupWorkspaceRequest } from "@/management/preset/group/events";
import type { FileBrowserService } from "@/management/storage/file-browser-service";
import {
	DRAG_HANDLE_MARGIN,
	DRAG_THRESHOLD,
	PREVIEW_TRANSITION,
	RESIZE_MARGIN,
} from "@/management/workspace/events/constants";
import {
	getTileRect,
	snapPosition,
	snapSpan,
} from "@/management/workspace/layout/engine";
import type { LayoutItem } from "@/management/workspace/layout/grid";
import { resolveLayout } from "@/management/workspace/layout/grid";
import {
	catalogRef,
	catalogRefFromNumber,
	isWidget,
	isWidgetSurfaceIndex,
	presetRecordForCatalogRef,
} from "@/management/workspace/placement/resolve";
import {
	ATTR_DRAGGING,
	ATTR_GRID,
	ATTR_GROUP_PANEL,
	ATTR_GROUP_TILE,
	ATTR_PLACEMENT_INDEX,
	ATTR_PRESET_ID,
	ATTR_SCROLL,
	getPlacementId,
} from "@/management/workspace/placement/types";
import { CommitReconcile } from "@/management/workspace/reconcile-stub";
import {
	addPlacement,
	clearAll,
	togglePlacement,
} from "@/management/workspace/selection";
import type {
	GridSettings,
	Layout,
	SurfaceState,
} from "@/management/workspace/state";
import {
	classifyFromCatalogs,
	clipSelection,
} from "@/management/workspace/surface/tiles";

// ── CEP eval script ───────────────────────────────────────────────────────

type EvalScriptFn = (script: string, cb?: (r: string) => void) => void;
type StyledElement = Element & ElementCSSInlineStyle;

const readDataAttr = (el: Element | null | undefined, name: string): string =>
	el?.getAttribute(name)?.trim() ?? "";

const isPlainPrimaryMouseEvent = (
	ev: Pick<
		MouseEvent,
		"button" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey"
	>,
): boolean =>
	(typeof ev.button !== "number" || ev.button === 0) &&
	!ev.ctrlKey &&
	!ev.metaKey &&
	!ev.shiftKey &&
	!ev.altKey;

const getEvalScript = (): EvalScriptFn | null => {
	if (typeof window === "undefined") return null;
	const w = window as unknown as {
		__adobe_cep__?: { evalScript?: EvalScriptFn };
		CSInterface?: new () => { evalScript?: EvalScriptFn };
	};
	if (typeof w.__adobe_cep__?.evalScript === "function")
		return w.__adobe_cep__.evalScript;
	try {
		if (w.CSInterface) {
			const cs = new w.CSInterface();
			if (typeof cs.evalScript === "function") return cs.evalScript.bind(cs);
		}
	} catch {
		/* noop */
	}
	return null;
};

const runCep = (jsx: string): void => {
	try {
		getEvalScript()?.(jsx);
	} catch {
		/* noop */
	}
};

const _timerNow = (): number =>
	typeof performance !== "undefined" ? performance.now() : Date.now();

// ── Edge detection (matches old project) ─────────────────────────────────
// RESIZE_MARGIN: corners/edges ↁEresize handle; DRAG_HANDLE_MARGIN ↁEdrag-handle area
type EdgeInfo = {
	n: boolean;
	s: boolean;
	e: boolean;
	w: boolean;
};

/** Returns resize handle if pointer is within RESIZE_MARGIN of corner/edge. */
const getEdge = (
	pointerX: number,
	pointerY: number,
	el: Element,
): EdgeInfo | null => {
	const r = el.getBoundingClientRect();
	const x = pointerX - r.left;
	const y = pointerY - r.top;
	const n = y < RESIZE_MARGIN;
	const s = y > r.height - RESIZE_MARGIN;
	const ew = x < RESIZE_MARGIN;
	const ee = x > r.width - RESIZE_MARGIN;
	if (!n && !s && !ew && !ee) return null;
	return { n, s, e: ee, w: ew };
};

/** Returns true if pointer is within DRAG_HANDLE_MARGIN of any edge (move zone). */
const inDragHandleArea = (
	pointerX: number,
	pointerY: number,
	el: Element,
): boolean => {
	const r = el.getBoundingClientRect();
	const x = pointerX - r.left;
	const y = pointerY - r.top;
	return (
		x < DRAG_HANDLE_MARGIN ||
		x > r.width - DRAG_HANDLE_MARGIN ||
		y < DRAG_HANDLE_MARGIN ||
		y > r.height - DRAG_HANDLE_MARGIN
	);
};

const edgeCursor = (edge: EdgeInfo): string => {
	if (edge.n && edge.w) return "nw-resize";
	if (edge.n && edge.e) return "ne-resize";
	if (edge.s && edge.w) return "sw-resize";
	if (edge.s && edge.e) return "se-resize";
	if (edge.n || edge.s) return "ns-resize";
	return "ew-resize";
};

// ── Drag state ────────────────────────────────────────────────────────────

type ActiveOp = {
	kind: "move" | "resize";
	edge: EdgeInfo | null;
	targetSurfaceIndexStr: string;
	targetLayoutId: string;
	/** When primary tile is preset/group: surface index string */
	presetSurfaceIndexStr: string | null;
	startPX: number;
	startPY: number;
	startLeft: number;
	startTop: number;
	startW: number;
	startH: number;
	/** pointer offset from widget origin (for move) */
	offsetX: number;
	offsetY: number;
	hasMoved: boolean;
	/** last snapped grid position  Eused to skip redundant resolveLayout calls */
	lastSnapX: number;
	lastSnapY: number;
	lastSnapW: number;
	lastSnapH: number;
	/** Surface indices participating in this drag */
	selectedTileIndices: number[];
	/** Cached geometry; each `id` is `String(surfaceIndex)` */
	selectedBaseLayouts: LayoutItem[];
	/** Set of `String(surfaceIndex)` for tiles in this drag */
	selectedLayoutIds: Set<string>;
	previewLayout: LayoutItem[] | null;
};

const buildSelectedLayoutIds = (op: ActiveOp): Set<string> =>
	new Set(op.selectedTileIndices.map(String));

// ── Apply resolved layout to DOM ──────────────────────────────────────────

/** DOM tile ↁElayout row id (`String(surface index)`). */
const layoutItemIdFromPlacementElement = (
	_el: SurfaceState,
	element: Element,
): string | null => getPlacementId(element)?.trim() ?? null;

/**
 * Geometry for the tile under the pointer: collected layout first, then DOM + state.
 */
const resolveDragLayoutItem = (
	state: SurfaceState,
	el: Element,
	fallbackLayoutId: string,
): LayoutItem | null => {
	const domId = layoutItemIdFromPlacementElement(state, el);
	const tryIds = new Set<string>();
	if (domId) tryIds.add(domId);
	const trimmedFallback = fallbackLayoutId.trim();
	if (trimmedFallback) tryIds.add(trimmedFallback);

	const items = collectLayoutItems(state);
	const itemById = indexLayoutItems(items);
	for (const id of tryIds) {
		const hit = itemById.get(id);
		if (hit) return hit;
	}

	const surfaceIndexStr = getPlacementId(el)?.trim() ?? "";
	if (!surfaceIndexStr) return null;
	const idx = Number.parseInt(surfaceIndexStr, 10);
	if (!Number.isFinite(idx) || idx < 0) return null;
	const t = state.surfaceTiles[idx];
	if (!t) return null;
	return {
		id: String(idx),
		x: t.x,
		y: t.y,
		width: t.width,
		height: t.height,
	};
};

const collectLayoutItems = (state: SurfaceState): LayoutItem[] =>
	state.surfaceTiles.map((t, index) => ({
		id: String(index),
		x: t.x,
		y: t.y,
		width: t.width,
		height: t.height,
	}));

const indexLayoutItems = (items: LayoutItem[]): Map<string, LayoutItem> => {
	const map = new Map<string, LayoutItem>();
	for (const item of items) {
		map.set(item.id, item);
	}
	return map;
};

const resolveLayoutElement = (
	container: ParentNode,
	layoutId: string,
): StyledElement | null =>
	container.querySelector<StyledElement>(
		`[${ATTR_PLACEMENT_INDEX}="${layoutId}"]`,
	);

const resolvePlacementElement = (
	container: ParentNode,
	surfaceIndexStr: string,
): StyledElement | null =>
	container.querySelector<StyledElement>(
		`[${ATTR_PLACEMENT_INDEX}="${surfaceIndexStr}"]`,
	);

const applyLayout = (
	container: ParentNode,
	items: LayoutItem[],
	g: GridSettings,
	skipId?: string,
	transition?: string,
	skipIds?: ReadonlySet<string>,
): void => {
	for (const item of items) {
		if (item.id === skipId || skipIds?.has(item.id)) continue;
		const el = resolveLayoutElement(container, item.id);
		if (!el) continue;
		const rect = getTileRect(item as Layout, g);
		if (transition !== undefined) el.style.transition = transition;
		el.style.left = `${rect.left}px`;
		el.style.top = `${rect.top}px`;
		el.style.width = `${rect.width}px`;
		el.style.height = `${rect.height}px`;
	}
};

// ── Main setup ────────────────────────────────────────────────────────────

export type EventsOptions = {
	/** Value of \`detectCepHostCode()\`. When AE, eval align/anchor ExtendScript */
	hostCode?: string;
	fileBrowser?: FileBrowserService | null;
	/**
	 * Option slot only. No handler site in this build calls
	 * `importWorkspaceFile`; the underlying `importFile` helper would dispatch
	 * `runScriptFile` for any `.jsx`/`.jsxbin` path with no scheme or signature
	 * check. Keep this option unreferenced until a future caller wires it AND
	 * a path-allowlist / host-side confirm dialog is added.
	 */
	importWorkspaceFile?: (filePath: string) => Promise<string>;
	executeWorkspacePreset?: (presetId: string) => Promise<void>;
	executePreset?: (preset: Preset) => Promise<void>;
	onPresetDropToGroup?: (payload: {
		groupPresetId: string;
		presetIds: readonly string[];
		dropClientX: number;
		dropClientY: number;
	}) => boolean;
	/**
	 * Drag-out handler for a **group tile** dropped onto the workspace
	 * background (not onto another group). Returns `true` when the call
	 * site handled the drop (so the caller skips the generic move path).
	 *
	 * Direction C of Issue #86: the group is dissolved; its members are
	 * re-surfaced as individual tiles via `releaseGroupPreset`.
	 */
	onGroupDrop?: (payload: {
		groupId: string;
		dropClientX: number;
		dropClientY: number;
	}) => boolean;
	/** Menu widget primary click → same CEP / fallback menu as right-click. */
	presentContextMenuAt?: (ev: MouseEvent, target: EventTarget | null) => void;
};

export const setupInteractionEvents = (
	container: Element,
	getState: () => SurfaceState,
	setState: (next: SurfaceState) => void,
	rerender: () => void,
	opts?: EventsOptions,
): (() => void) => {
	let op: ActiveOp | null = null;
	let suppressNextClick = false;
	let selectionDrag: {
		startX: number;
		startY: number;
	} | null = null;

	const handledPointerMoves = new WeakSet<Event>();
	const handledPointerUps = new WeakSet<Event>();
	const _aeExecutor =
		opts?.hostCode === "AEFT"
			? createCepHostExecutor(window, "after-effects")
			: null;
	const _fileBrowser = opts?.fileBrowser ?? null;

	const scrollEl = (): StyledElement | null =>
		container.querySelector<StyledElement>("[data-workspace-scroll]");
	const gridEl = (): StyledElement | null =>
		container.querySelector<StyledElement>("[data-workspace-grid]");
	const selectionRectEl = (): StyledElement | null =>
		container.querySelector<StyledElement>("[data-selection-rect]");

	const _gridSelectionIncludesSurfaceIndex = (
		s: SurfaceState,
		surfaceIndexStr: string,
	): boolean => {
		const idx = Number.parseInt(surfaceIndexStr, 10);
		return Number.isFinite(idx) && s.selectedSurfaceIndices.includes(idx);
	};

	const setRectangularPlacementSelection = (
		state: SurfaceState,
		widgetSurfaceIndexStrs: string[],
		presetSurfaceIndexStrs: string[],
	): void => {
		const widgetIndices = widgetSurfaceIndexStrs.flatMap((s) => {
			const n = Number.parseInt(s.trim(), 10);
			return Number.isFinite(n) && n >= 0 && isWidgetSurfaceIndex(state, n)
				? [n]
				: [];
		});
		const presetIndices = presetSurfaceIndexStrs.flatMap((s) => {
			const n = Number.parseInt(s.trim(), 10);
			return Number.isFinite(n) && n >= 0 ? [n] : [];
		});
		const merged = clipSelection(
			[...widgetIndices, ...presetIndices],
			state.surfaceTiles.length,
		);
		const presetStrs = merged.flatMap((i) =>
			isWidgetSurfaceIndex(state, i) ? [] : [String(i)],
		);
		const catalogRefs = presetStrs.flatMap((pid) => {
			const r = catalogRef(state, pid);
			return r?.trim() ? [r] : [];
		});
		setState({
			...state,
			selectedSurfaceIndices: merged,
			presetSelectedIds: catalogRefs,
			presetFocusId: catalogRefs.at(-1) ?? null,
		});
	};

	const setPointerCaptureSafely = (
		ev: Pick<PointerEvent, "currentTarget" | "pointerId">,
	): void => {
		const el = ev.currentTarget as StyledElement | null;
		if (!el || typeof el.setPointerCapture !== "function") {
			return;
		}
		if (typeof ev.pointerId !== "number") {
			return;
		}
		try {
			el.setPointerCapture(ev.pointerId);
		} catch {
			// Some CEP runtimes can reject capture; dragging still works without it.
		}
	};

	// ── Pointer events ──────────────────────────────────────────────────

	const onPointerDown = (ev: PointerEvent): void => {
		// Allow button 0 (left) and button 1 (middle); ignore right-click etc.
		if (
			ev.button !== 0 &&
			ev.button !== 1 &&
			!(typeof ev.button !== "number")
		) {
			return;
		}
		const target = ev.target as StyledElement | null;
		if (!target) return;
		if (
			target.closest("[data-ws-easing-editor-canvas]") &&
			ev.button === 0 &&
			(ev.ctrlKey || ev.metaKey)
		) {
			// The EasingWidget canvas handles Ctrl/Cmd+left click itself to
			// create / delete midpoints on the curve. We must not call
			// stopImmediatePropagation here, otherwise the canvas's own
			// pointerdown handler (target phase) never fires. We only need
			// to suppress the follow-up click so the workspace does not
			// toggle the widget tile's selection.
			suppressNextClick = true;
			return;
		}
		const pointerState = getState();
		if (
			pointerState.openedGroupPresetId &&
			!target.closest("[data-workspace-group-panel]")
		) {
			setState({
				...pointerState,
				openedGroupPresetId: null,
			});
			rerender();
			return;
		}
		const isTextInputField = Boolean(
			target.closest("input, textarea, select, [contenteditable]"),
		);
		const isWorkspaceActionControl = Boolean(
			target.closest("[data-ws-action]"),
		);
		if (
			isTextInputField ||
			(target.closest(
				"button, [data-ws-easing-editor-canvas], select, textarea, [contenteditable]",
			) &&
				!isWorkspaceActionControl)
		) {
			return;
		}

		const placementEl = target.closest<StyledElement>(
			`[${ATTR_PLACEMENT_INDEX}]`,
		);
		const hitState = getState();
		const surfaceIndexStrForTile = placementEl
			? getPlacementId(placementEl)
			: null;
		const hitIdx =
			surfaceIndexStrForTile !== null
				? Number.parseInt(surfaceIndexStrForTile, 10)
				: Number.NaN;
		const tileAtHit =
			Number.isFinite(hitIdx) && hitIdx >= 0
				? hitState.surfaceTiles[hitIdx]
				: undefined;
		const isWidgetTile =
			tileAtHit &&
			Number.isFinite(hitIdx) &&
			hitIdx >= 0 &&
			isWidgetSurfaceIndex(hitState, hitIdx);
		const presetSurfaceIndexStr =
			surfaceIndexStrForTile && !isWidgetTile ? surfaceIndexStrForTile : "";
		const widgetEl = placementEl;
		const presetEl = placementEl;
		const actionEl = target.closest<StyledElement>("[data-ws-action]");
		const actionName = readDataAttr(actionEl, "data-ws-action");
		const pointerX = ev.clientX;
		const pointerY = ev.clientY;
		const edge = widgetEl ? getEdge(pointerX, pointerY, widgetEl) : null;
		const isMoveClick =
			ev.button === 1 || (ev.button === 0 && (ev.ctrlKey || ev.metaKey));

		if (!widgetEl && !presetEl) {
			const state = getState();
			const grid = gridEl();
			const inGrid = Boolean(
				grid && (target === grid || grid.contains(target)),
			);
			if (
				ev.button === 0 &&
				!state.layoutLocked &&
				grid &&
				inGrid &&
				ev.shiftKey
			) {
				// Shift+drag only: start multi-select rectangle drag
				const sc = scrollEl();
				const scRect = (sc ?? container).getBoundingClientRect();
				const scrollLeft = sc?.scrollLeft ?? 0;
				const scrollTop = sc?.scrollTop ?? 0;
				const startX = Math.max(0, ev.clientX - scRect.left + scrollLeft);
				const startY = Math.max(0, ev.clientY - scRect.top + scrollTop);
				selectionDrag = {
					startX,
					startY,
				};
				const rect = selectionRectEl() ?? document.createElement("div");
				rect.setAttribute("data-selection-rect", "");
				rect.style.cssText = `
					position: absolute;
					pointer-events: none;
					border: 1px solid var(--color-ty-ws-selrect-border);
					background: var(--color-ty-ws-selrect-fill);
					border-radius: var(--ty-ws-grid-radius, 4px);
					z-index: 9999;
				`;
				rect.style.left = `${startX}px`;
				rect.style.top = `${startY}px`;
				rect.style.width = "0px";
				rect.style.height = "0px";
				if (!rect.parentElement) {
					grid.appendChild(rect);
				}
				setState(clearAll(state));
				ev.preventDefault();
				setPointerCaptureSafely(ev);
			}
			return;
		}
		if (getState().layoutLocked) return;

		// Determine drag kind following old project rules:
		//   isMoveClick (middle OR Ctrl/Cmd+left)                ↁEmove
		//   left-click + edge resize handle                       ↁEresize
		//   otherwise                                             ↁEpass through
		const targetEl = widgetEl ?? presetEl;
		if (!targetEl) return;
		const isWidgetActionControl =
			Boolean(widgetEl) && actionName.trim().length > 0;
		if (isWidgetActionControl && !isTextInputField && !isMoveClick && !edge) {
			return;
		}
		if (isWidgetActionControl && isTextInputField && !isMoveClick && !edge) {
			return;
		}
		const state = getState();
		const totalSelectedPlacements = state.selectedSurfaceIndices.length;
		const clickedOnSelectedTile =
			surfaceIndexStrForTile !== null &&
			Number.isFinite(hitIdx) &&
			state.selectedSurfaceIndices.includes(hitIdx);
		/** Plain left-drag on any selected shell moves the whole selection (no modifier). */
		const selectionMove =
			ev.button === 0 &&
			!ev.ctrlKey &&
			!ev.metaKey &&
			!ev.shiftKey &&
			clickedOnSelectedTile;
		/** Ctrl/Cmd + drag on a selected shell moves the whole selection together. */
		const selectionMoveViaModifier =
			isMoveClick && totalSelectedPlacements > 1 && clickedOnSelectedTile;
		const selectionMoveExtends = selectionMove || selectionMoveViaModifier;

		let kind: "move" | "resize" | null = null;
		if (selectionMove || isMoveClick) {
			kind = "move";
		} else if (edge && ev.button === 0 && !ev.ctrlKey && !ev.metaKey) {
			kind = "resize";
		}
		if (!kind) return;

		const sc = scrollEl();
		const scRect = (sc ?? container).getBoundingClientRect();
		const scrollLeft = sc?.scrollLeft ?? 0;
		const scrollTop = sc?.scrollTop ?? 0;
		const curLeft = Number.parseFloat(targetEl.style.left) || 0;
		const curTop = Number.parseFloat(targetEl.style.top) || 0;

		const selectedTileIndices: number[] =
			kind === "move"
				? selectionMoveExtends
					? [...state.selectedSurfaceIndices]
					: Number.isFinite(hitIdx) && hitIdx >= 0
						? [hitIdx]
						: []
				: Number.isFinite(hitIdx) && hitIdx >= 0
					? [hitIdx]
					: [];
		const selectedBaseLayouts: LayoutItem[] = selectedTileIndices
			.map((idx) => {
				const t = state.surfaceTiles[idx];
				if (!t) return null;
				return {
					id: String(idx),
					x: t.x,
					y: t.y,
					width: t.width,
					height: t.height,
				};
			})
			.filter((x): x is LayoutItem => Boolean(x));
		const targetLayoutId = surfaceIndexStrForTile ?? "";

		op = {
			kind,
			edge: kind === "resize" ? edge : null,
			targetSurfaceIndexStr: surfaceIndexStrForTile ?? "",
			targetLayoutId,
			presetSurfaceIndexStr: isWidgetTile
				? null
				: presetSurfaceIndexStr || null,
			startPX: ev.clientX,
			startPY: ev.clientY,
			startLeft: curLeft,
			startTop: curTop,
			startW: targetEl.clientWidth,
			startH: targetEl.clientHeight,
			offsetX: ev.clientX - scRect.left + scrollLeft - curLeft,
			offsetY: ev.clientY - scRect.top + scrollTop - curTop,
			hasMoved: false,
			lastSnapX: -1,
			lastSnapY: -1,
			lastSnapW: -1,
			lastSnapH: -1,
			selectedTileIndices,
			selectedBaseLayouts,
			selectedLayoutIds: buildSelectedLayoutIds({
				selectedTileIndices,
			} as ActiveOp),
			previewLayout: null,
		};

		ev.preventDefault();
		setPointerCaptureSafely(ev);
		rerender();
	};

	const onPointerMove = (ev: PointerEvent): void => {
		if (handledPointerMoves.has(ev)) return;
		handledPointerMoves.add(ev);

		if (selectionDrag) {
			const state = getState();
			const sc = scrollEl();
			const scRect = (sc ?? container).getBoundingClientRect();
			const scrollLeft = sc?.scrollLeft ?? 0;
			const scrollTop = sc?.scrollTop ?? 0;
			const currentX = Math.max(0, ev.clientX - scRect.left + scrollLeft);
			const currentY = Math.max(0, ev.clientY - scRect.top + scrollTop);
			const x = Math.min(selectionDrag.startX, currentX);
			const y = Math.min(selectionDrag.startY, currentY);
			const width = Math.abs(currentX - selectionDrag.startX);
			const height = Math.abs(currentY - selectionDrag.startY);
			const rectEl = selectionRectEl();
			if (rectEl) {
				rectEl.style.left = `${x}px`;
				rectEl.style.top = `${y}px`;
				rectEl.style.width = `${width}px`;
				rectEl.style.height = `${height}px`;
			}

			const selectedWidgetSurfaceStrs: string[] = [];
			const selectedPresetIndexStrs: string[] = [];
			const x2 = x + width;
			const y2 = y + height;
			for (let i = 0; i < state.surfaceTiles.length; i += 1) {
				const t = state.surfaceTiles[i];
				const gridBox = {
					id: "",
					widgetType: "quick-actions" as const,
					x: t.x,
					y: t.y,
					width: t.width,
					height: t.height,
				} as Layout;
				const rect = getTileRect(gridBox, state.grid);
				const wx2 = rect.left + rect.width;
				const wy2 = rect.top + rect.height;
				const intersects =
					x < wx2 && x2 > rect.left && y < wy2 && y2 > rect.top;
				if (!intersects) continue;
				if (isWidgetSurfaceIndex(state, i)) {
					selectedWidgetSurfaceStrs.push(String(i));
				} else {
					selectedPresetIndexStrs.push(String(i));
				}
			}
			setRectangularPlacementSelection(
				state,
				selectedWidgetSurfaceStrs,
				selectedPresetIndexStrs,
			);
			return;
		}

		if (!op) {
			const target = ev.target as StyledElement | null;
			// Cursor hint while hovering
			if (!target) return;
			const dragEl = target.closest<StyledElement>(`[${ATTR_PLACEMENT_INDEX}]`);
			if (dragEl && !getState().layoutLocked) {
				const edge = getEdge(ev.clientX, ev.clientY, dragEl);
				if (edge) {
					dragEl.style.cursor = edgeCursor(edge);
				} else if (inDragHandleArea(ev.clientX, ev.clientY, dragEl)) {
					dragEl.style.cursor = "grab";
				} else {
					dragEl.style.cursor = "";
				}
			}
			return;
		}

		const dx = ev.clientX - op.startPX;
		const dy = ev.clientY - op.startPY;

		// Don't start moving until threshold is exceeded
		if (!op.hasMoved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;

		if (!op.hasMoved) {
			op.hasMoved = true;
			for (const idx of op.selectedTileIndices) {
				const selectedEl = resolvePlacementElement(container, String(idx));
				selectedEl?.setAttribute(ATTR_DRAGGING, "");
				if (selectedEl) {
					selectedEl.style.zIndex = "100";
				}
			}
		}

		const {
			kind,
			edge,
			startLeft,
			startTop,
			startW,
			startH,
			offsetX,
			offsetY,
			targetLayoutId,
		} = op;
		const el = resolvePlacementElement(container, op.targetSurfaceIndexStr);
		if (!el) {
			op = null;
			return;
		}
		const sc = scrollEl();
		const scRect = (sc ?? container).getBoundingClientRect();
		const scrollLeft = sc?.scrollLeft ?? 0;
		const scrollTop = sc?.scrollTop ?? 0;
		const state = getState();
		const g = state.grid;
		const isMultiSelectionMove =
			kind === "move" && op.selectedLayoutIds.size > 1;

		let newLeft: number;
		let newTop: number;
		let newW: number;
		let newH: number;

		if (kind === "move") {
			newLeft = Math.max(0, ev.clientX - scRect.left + scrollLeft - offsetX);
			newTop = Math.max(0, ev.clientY - scRect.top + scrollTop - offsetY);
			if (!isMultiSelectionMove) {
				el.style.left = `${newLeft}px`;
				el.style.top = `${newTop}px`;
			}
			newW = op.startW;
			newH = op.startH;
		} else {
			const minPx = 1;
			if (edge?.e) {
				newW = Math.max(minPx, startW + dx);
				el.style.width = `${newW}px`;
			} else if (edge?.w) {
				newW = Math.max(minPx, startW - dx);
				el.style.width = `${newW}px`;
				newLeft = startLeft + (startW - newW);
				el.style.left = `${newLeft}px`;
			} else {
				newW = op.startW;
			}
			if (edge?.s) {
				newH = Math.max(minPx, startH + dy);
				el.style.height = `${newH}px`;
			} else if (edge?.n) {
				newH = Math.max(minPx, startH - dy);
				el.style.height = `${newH}px`;
				newTop = startTop + (startH - newH);
				el.style.top = `${newTop}px`;
			} else {
				newH = op.startH;
			}
			newLeft = Number.parseFloat(el.style.left) || startLeft;
			newTop = Number.parseFloat(el.style.top) || startTop;
		}

		if (isMultiSelectionMove) {
			const deltaLeft = newLeft - startLeft;
			const deltaTop = newTop - startTop;
			for (const base of op.selectedBaseLayouts) {
				const selectedEl = resolvePlacementElement(container, base.id);
				if (!selectedEl) continue;
				const rect = getTileRect(base as Layout, g);
				selectedEl.style.left = `${rect.left + deltaLeft}px`;
				selectedEl.style.top = `${rect.top + deltaTop}px`;
			}
		}

		// ── Real-time preview: resolve collisions for displaced widgets ──────
		const snapX = snapPosition(newLeft, g);
		const snapY = snapPosition(newTop, g);
		const snapW = snapSpan(newW ?? startW, g);
		const snapH = snapSpan(newH ?? startH, g);

		if (
			snapX !== op.lastSnapX ||
			snapY !== op.lastSnapY ||
			snapW !== op.lastSnapW ||
			snapH !== op.lastSnapH
		) {
			op.lastSnapX = snapX;
			op.lastSnapY = snapY;
			op.lastSnapW = snapW;
			op.lastSnapH = snapH;

			const layout = resolveDragLayoutItem(state, el, targetLayoutId);
			if (layout) {
				const primaryPlacementIsWidget = isWidget(
					state,
					op.targetSurfaceIndexStr,
				);
				const nWidgetTile = op.selectedTileIndices.filter((i) =>
					isWidgetSurfaceIndex(state, i),
				).length;
				const nPresetTile = op.selectedTileIndices.length - nWidgetTile;
				const hasMultiWidgetPreview =
					primaryPlacementIsWidget && kind === "move" && nWidgetTile > 1;
				const hasMultiPresetPreview =
					!primaryPlacementIsWidget && kind === "move" && nPresetTile > 1;
				const hasMixedMultiPreview =
					kind === "move" &&
					op.selectedLayoutIds.size > 1 &&
					nWidgetTile > 0 &&
					nPresetTile > 0;
				const hasAnyMultiPreview =
					hasMultiWidgetPreview ||
					hasMultiPresetPreview ||
					hasMixedMultiPreview;

				if (hasAnyMultiPreview) {
					const targetX = Math.max(0, (newLeft - g.gap) / (g.cellSize + g.gap));
					const targetY = Math.max(0, (newTop - g.gap) / (g.cellSize + g.gap));
					const deltaX = targetX - layout.x;
					const deltaY = targetY - layout.y;
					const movedSelected: LayoutItem[] = op.selectedBaseLayouts.map(
						(w) => ({
							id: w.id,
							x: w.x + deltaX,
							y: w.y + deltaY,
							width: w.width,
							height: w.height,
						}),
					);
					const minX = Math.min(...movedSelected.map((item) => item.x));
					const minY = Math.min(...movedSelected.map((item) => item.y));
					const maxX = Math.max(
						...movedSelected.map((item) => item.x + item.width),
					);
					const maxY = Math.max(
						...movedSelected.map((item) => item.y + item.height),
					);
					const selectionBox: LayoutItem = {
						id: "__selection__",
						x: minX,
						y: minY,
						width: maxX - minX,
						height: maxY - minY,
						dragDirection: { dx: targetX - layout.x, dy: targetY - layout.y },
					};
					const selectedLayoutIdSet = op.selectedLayoutIds;
					const others: LayoutItem[] = collectLayoutItems(state).filter(
						(item) => !selectedLayoutIdSet.has(item.id),
					);
					const resolved = resolveLayout(
						[...others, selectionBox],
						selectionBox,
					);
					const previewLayout = [
						...resolved.filter((item) => item.id !== "__selection__"),
						...movedSelected,
					];
					op.previewLayout = null;
					applyLayout(container, previewLayout, g, undefined, "");
					return;
				}
				const originalLayout: LayoutItem[] = collectLayoutItems(state);
				const draggingItem: LayoutItem = {
					id: layout.id,
					x: snapX,
					y: snapY,
					width: snapW,
					height: snapH,
					dragDirection: {
						dx: snapX - layout.x,
						dy: snapY - layout.y,
					},
				};
				const resolved = resolveLayout(originalLayout, draggingItem);
				// Animate displaced widgets (skip the one being dragged  Eit moves freely)
				applyLayout(container, resolved, g, layout.id, PREVIEW_TRANSITION);
			}
		}
	};

	const onPointerUp = (ev?: PointerEvent | MouseEvent): void => {
		if (ev) {
			if (handledPointerUps.has(ev)) return;
			handledPointerUps.add(ev);
		}

		if (selectionDrag) {
			selectionRectEl()?.remove();
			selectionDrag = null;
			rerender();
			return;
		}
		if (!op) return;
		const { kind, hasMoved, targetLayoutId } = op;
		const el = resolvePlacementElement(container, op.targetSurfaceIndexStr);

		for (const idx of op.selectedTileIndices) {
			const selectedEl = resolvePlacementElement(container, String(idx));
			selectedEl?.removeAttribute(ATTR_DRAGGING);
			if (selectedEl) {
				selectedEl.style.zIndex = "";
			}
		}
		if (el) el.style.cursor = "";

		if (!hasMoved) {
			op = null;
			return;
		}

		suppressNextClick = true;

		const state = getState();
		if (!el) {
			op = null;
			return;
		}
		const layout = resolveDragLayoutItem(state, el, targetLayoutId);
		if (!layout) {
			op = null;
			return;
		}

		const g = state.grid;

		if (
			kind === "move" &&
			!isWidget(state, op.targetSurfaceIndexStr) &&
			!op.selectedTileIndices.some((i) =>
				isWidgetSurfaceIndex(state, String(i)),
			) &&
			(opts?.onPresetDropToGroup || opts?.onGroupDrop)
		) {
			const dropClientX = ev?.clientX ?? Number.NaN;
			const dropClientY = ev?.clientY ?? Number.NaN;
			if (Number.isFinite(dropClientX) && Number.isFinite(dropClientY)) {
				const dragIndices = Array.from(
					new Set(
						op.selectedTileIndices.length > 0
							? op.selectedTileIndices
							: op.presetSurfaceIndexStr
								? [Number.parseInt(op.presetSurfaceIndexStr, 10)]
								: [],
					),
				).filter((n) => Number.isFinite(n) && n >= 0);
				const draggedCatalogIds = Array.from(
					new Set(
						dragIndices
							.map((i) => catalogRefFromNumber(state, i))
							.filter((r): r is string => Boolean(r?.trim())),
					),
				);
				const hiddenDragPlacements: Array<{
					surfaceIndexStr: string;
					pointerEvents: string;
				}> = [];
				for (const idx of dragIndices) {
					const dragEl = resolvePlacementElement(container, String(idx));
					if (!dragEl) {
						continue;
					}
					hiddenDragPlacements.push({
						surfaceIndexStr: String(idx),
						pointerEvents: dragEl.style.pointerEvents,
					});
					dragEl.style.pointerEvents = "none";
				}
				const dropTarget = (
					document.elementFromPoint(
						dropClientX,
						dropClientY,
					) as StyledElement | null
				)?.closest<StyledElement>(`[${ATTR_GROUP_TILE}]`);
				for (const { surfaceIndexStr, pointerEvents } of hiddenDragPlacements) {
					const dragEl = resolvePlacementElement(container, surfaceIndexStr);
					if (dragEl) {
						dragEl.style.pointerEvents = pointerEvents;
					}
				}
				const groupPresetId =
					readDataAttr(
						dropTarget?.querySelector(`[${ATTR_PRESET_ID}]`) ?? dropTarget,
						ATTR_PRESET_ID,
					).trim() ||
					(dropTarget
						? catalogRef(state, getPlacementId(dropTarget) ?? "")
						: "");
				const groupIdSet = new Set(
					state.groupCatalogEntries.map((g) => g.id.trim()),
				);
				const isGroupSource =
					groupPresetId === "" &&
					draggedCatalogIds.length > 0 &&
					draggedCatalogIds.some((id) => groupIdSet.has(id));
				if (groupPresetId && opts?.onPresetDropToGroup) {
					const sourceIds = draggedCatalogIds.filter(
						(id) => id !== groupPresetId,
					);
					if (sourceIds.length > 0) {
						const handled = opts.onPresetDropToGroup({
							groupPresetId,
							presetIds: sourceIds,
							dropClientX,
							dropClientY,
						});
						if (handled) {
							op = null;
							rerender();
							return;
						}
					}
				} else if (isGroupSource && opts?.onGroupDrop && dropTarget === null) {
					const groupId = draggedCatalogIds[0] ?? "";
					if (groupId) {
						const handled = opts.onGroupDrop({
							groupId,
							dropClientX,
							dropClientY,
						});
						if (handled) {
							op = null;
							rerender();
							return;
						}
					}
				}
			}
		}

		const primaryPlacementIsWidget = isWidgetSurfaceIndex(
			state,
			op.targetSurfaceIndexStr,
		);
		const nWidgetTile = op.selectedTileIndices.filter((i) =>
			isWidgetSurfaceIndex(state, i),
		).length;
		const nPresetTile = op.selectedTileIndices.length - nWidgetTile;
		const hasMultiWidgetMove =
			primaryPlacementIsWidget && kind === "move" && nWidgetTile > 1;
		const hasMultiPresetMove =
			!primaryPlacementIsWidget && kind === "move" && nPresetTile > 1;
		const totalSelectedCount = op.selectedTileIndices.length;
		const hasAnyMultiMove =
			hasMultiWidgetMove || hasMultiPresetMove || totalSelectedCount > 1;

		if (hasAnyMultiMove) {
			const multiLayout = (() => {
				if (op.previewLayout) {
					return op.previewLayout;
				}
				const targetItem = resolveDragLayoutItem(state, el, targetLayoutId);
				if (!targetItem) {
					return [] as LayoutItem[];
				}
				const newX = snapPosition(Number.parseFloat(el.style.left), g);
				const newY = snapPosition(Number.parseFloat(el.style.top), g);
				const deltaX = newX - targetItem.x;
				const deltaY = newY - targetItem.y;

				const movedSelected: LayoutItem[] = op.selectedBaseLayouts.map(
					(item) => ({
						id: item.id,
						x: item.x + deltaX,
						y: item.y + deltaY,
						width: item.width,
						height: item.height,
					}),
				);

				const minX = Math.min(...movedSelected.map((item) => item.x));
				const minY = Math.min(...movedSelected.map((item) => item.y));
				const maxX = Math.max(
					...movedSelected.map((item) => item.x + item.width),
				);
				const maxY = Math.max(
					...movedSelected.map((item) => item.y + item.height),
				);
				const selectionBox: LayoutItem = {
					id: "__selection__",
					x: minX,
					y: minY,
					width: maxX - minX,
					height: maxY - minY,
					dragDirection: { dx: deltaX, dy: deltaY },
				};
				const selectedLayoutIdSet = op.selectedLayoutIds;
				const others: LayoutItem[] = collectLayoutItems(state).filter(
					(item) => !selectedLayoutIdSet.has(item.id),
				);
				const resolved = resolveLayout([...others, selectionBox], selectionBox);
				return [
					...resolved.filter((item) => item.id !== "__selection__"),
					...movedSelected,
				];
			})();
			applyLayout(container, multiLayout, g, undefined, "");
			const nextMap = new Map(multiLayout.map((item) => [item.id, item]));
			setState({
				...state,
				surfaceTiles: state.surfaceTiles.map((t, i) => {
					const item = nextMap.get(String(i));
					if (!item) return t;
					return {
						...t,
						x: item.x,
						y: item.y,
						width: item.width,
						height: item.height,
					};
				}),
			});
			rerender();
			op = null;
			return;
		}

		// Snap the dragged item to the nearest grid cell
		let draggingItem: LayoutItem;
		if (kind === "move") {
			const newX = snapPosition(Number.parseFloat(el.style.left), g);
			const newY = snapPosition(Number.parseFloat(el.style.top), g);
			draggingItem = {
				id: layout.id,
				x: newX,
				y: newY,
				width: layout.width,
				height: layout.height,
				dragDirection: { dx: newX - layout.x, dy: newY - layout.y },
			};
		} else {
			const newW = snapSpan(Number.parseFloat(el.style.width), g);
			const newH = snapSpan(Number.parseFloat(el.style.height), g);
			const newX = snapPosition(Number.parseFloat(el.style.left), g);
			const newY = snapPosition(Number.parseFloat(el.style.top), g);
			draggingItem = {
				id: layout.id,
				x: newX,
				y: newY,
				width: newW,
				height: newH,
				dragDirection: { dx: newX - layout.x, dy: newY - layout.y },
			};
		}

		// Resolve collisions  Epushes overlapping widgets/presets out of the way
		const originalLayout: LayoutItem[] = collectLayoutItems(state);
		const resolved = resolveLayout(originalLayout, draggingItem);

		// Remove preview transitions and apply final snapped positions
		applyLayout(container, resolved, g, undefined, "");

		// Persist resolved positions to state (do not rerender before setState  EReact
		// would re-apply stale `tileStyle` from WorkspaceGrid and undo `applyLayout`.)
		const resolvedMap = new Map(resolved.map((item) => [item.id, item]));
		setState({
			...state,
			surfaceTiles: state.surfaceTiles.map((t, i) => {
				const item = resolvedMap.get(String(i));
				if (!item) return t;
				return {
					...t,
					x: item.x,
					y: item.y,
					width: item.width,
					height: item.height,
				};
			}),
		});
		rerender();

		op = null;
	};

	// ── Click / input ────────────────────────────────────────────────────

	const onClick = (ev: MouseEvent): void => {
		if (suppressNextClick) {
			suppressNextClick = false;
			ev.stopImmediatePropagation();
			return;
		}
		// Defense in depth: even if the pointerdown capture handler somehow
		// failed to set the suppress flag (e.g. timing window, focus
		// hand-off, blur during Alt), the click event on the easing canvas
		// must never reach the workspace selection toggle below.
		const onClickTarget = ev.target as StyledElement | null;
		if (onClickTarget?.closest("[data-ws-easing-editor-canvas]")) {
			return;
		}
		if (op) return;

		const target = ev.target as StyledElement | null;
		if (!target) return;

		const btn = target.closest<StyledElement>("[data-ws-action]");
		const action = readDataAttr(btn, "data-ws-action");
		let state = getState();

		// Menu widget: left-click opens React flyout (onClick on tile). Right-click uses CEP menu.
		if (action === "open-widget-menu-context") {
			return;
		}

		// Check if click was inside a form control (do not hijack)
		const isFormField = Boolean(
			target.closest("input, textarea, select, [contenteditable]"),
		);

		// Use placement id on the shell grid (role is resolved from state, not DOM "kind").
		const placementEl = target.closest<StyledElement>(
			`[${ATTR_PLACEMENT_INDEX}]`,
		);
		const surfaceIndexStr = placementEl ? getPlacementId(placementEl) : null;
		if (isPlainPrimaryMouseEvent(ev) && surfaceIndexStr) {
			const idx = Number.parseInt(surfaceIndexStr, 10);
			const tile = Number.isFinite(idx) ? state.surfaceTiles[idx] : undefined;
			if (tile && !isWidgetSurfaceIndex(state, idx)) {
				const tileRole = classifyFromCatalogs(
					{
						widgetInstanceTypes: state.widgetInstanceTypes,
						groupCatalogEntries: state.groupCatalogEntries,
						presets: state.presets,
					},
					tile.id,
				);
				if (tileRole === "group") {
					ev.preventDefault();
					ev.stopImmediatePropagation();
					dispatchGroupWorkspaceRequest({
						type: "toggle-open",
						groupId: tile.id.trim(),
					});
					rerender();
					return;
				}
				const presetRecord = presetRecordForCatalogRef(state, tile.id);
				if (presetRecord && !presetRecord.data?.groupId) {
					ev.preventDefault();
					ev.stopImmediatePropagation();
					void opts?.executePreset?.(presetRecord).catch((error) => {
						setState({
							...getState(),
							statusMessage: `Preset failed: ${
								error instanceof Error ? error.message : String(error)
							}`,
						});
						rerender();
					});
					return;
				}
			}
		}

		// Plain click toggles selection on already-selected items (deselect on second click).
		// Ctrl/Cmd-click toggles regardless of current selection.
		// Shift-click adds to selection.
		// Shift+drag rectangle selects multiple items.
		// Layout lock blocks all selection mutation.
		if (!state.layoutLocked && surfaceIndexStr && !isFormField) {
			if (ev.ctrlKey || ev.metaKey) {
				const nextState = togglePlacement(state, surfaceIndexStr);
				setState(nextState);
			} else if (ev.shiftKey) {
				const nextState = addPlacement(state, surfaceIndexStr);
				setState(nextState);
			} else {
				// Plain click is activation/pass-through only. Selection changes require Ctrl/Cmd or Shift for every container type.
			}
			state = getState();
		} else if (
			!state.layoutLocked &&
			!placementEl &&
			!isFormField &&
			!ev.ctrlKey &&
			!ev.metaKey &&
			!ev.shiftKey &&
			!target.closest("[data-ws-status-bar]") &&
			!target.closest(`[${ATTR_GROUP_PANEL}]`) &&
			(Boolean(target.closest(`[${ATTR_GRID}]`)) ||
				Boolean(target.closest(`[${ATTR_SCROLL}]`))) &&
			state.selectedSurfaceIndices.length > 0
		) {
			const s0 = getState();
			setState(CommitReconcile(s0, clearAll(s0)));
			rerender();
			state = getState();
		}

		if (!action) return;

		if (action === "toggle-lock") {
			const next = !state.layoutLocked;
			if (next) {
			}
			setState({
				...state,
				layoutLocked: next,
				selectedSurfaceIndices: next ? [] : state.selectedSurfaceIndices,
				presetSelectedIds: next ? [] : state.presetSelectedIds,
				presetFocusId: next ? null : state.presetFocusId,
			});
			const lockBtn = container.querySelector<StyledElement>(
				"[data-ws-action='toggle-lock']",
			);
			if (lockBtn) lockBtn.classList.toggle("locked", next);
			return;
		}

		if (action === "select-workspace-preset") {
			const id = readDataAttr(btn, "data-preset-id");
			if (!id) return;
			if (!(ev.ctrlKey || ev.metaKey || ev.shiftKey)) {
				return;
			}
			let nextSelected = [...state.presetSelectedIds];
			if (ev.ctrlKey || ev.metaKey) {
				if (nextSelected.includes(id)) {
					nextSelected = nextSelected.filter((x) => x !== id);
				} else {
					nextSelected.push(id);
				}
			} else {
				if (!nextSelected.includes(id)) {
					nextSelected.push(id);
				}
			}
			setState({
				...state,
				presetSelectedIds: nextSelected,
				presetFocusId: id,
			});
			rerender();
			return;
		}

		if (action === "run-preset") {
			const id = readDataAttr(btn, "data-preset-id");
			if (!id) return;
			const presetRecord = presetRecordForCatalogRef(getState(), id);
			if (!presetRecord) return;
			void opts?.executePreset?.(presetRecord).catch((error) => {
				setState({
					...getState(),
					statusMessage: `Preset failed: ${
						error instanceof Error ? error.message : String(error)
					}`,
				});
				rerender();
			});
			return;
		}

		if (action.startsWith("align-target-")) {
			const raw = action.slice("align-target-".length);
			if (
				raw === "selection" ||
				raw === "comp" ||
				raw === "key-object" ||
				raw === "time"
			) {
				rerender();
			}
			return;
		}

		if (
			(TIME_ALIGN_ACTIONS as readonly string[]).includes(action) ||
			(ALIGN_ACTIONS as readonly string[]).includes(action)
		) {
			const jsx = (TIME_ALIGN_ACTIONS as readonly string[]).includes(action)
				? buildTimeAlignScript(action, "selection")
				: buildAlignLayersScript(action, "selection");
			if (jsx) runCep(jsx);
			return;
		}

		if (action === "anchor-point") {
			const pos = readDataAttr(btn, "data-anchor") || "center";
			if (!isValidAnchorPosition(pos)) return;
			setState({
				...state,
				statusMessage: `Applying anchor point: ${pos}...`,
			});
			rerender();
			runCep(buildAnchorScript(pos));
			setState({
				...getState(),
				statusMessage: `Anchor point applied: ${pos}`,
			});
			return;
		}
	};

	const onMouseDown = (ev: MouseEvent): void => {
		if (typeof window.PointerEvent !== "undefined") return;
		onPointerDown(ev as unknown as PointerEvent);
	};

	const onMouseMove = (ev: MouseEvent): void => {
		if (typeof window.PointerEvent !== "undefined") return;
		onPointerMove(ev as unknown as PointerEvent);
	};

	const onMouseUp = (ev: MouseEvent): void => {
		if (typeof window.PointerEvent !== "undefined") return;
		onPointerUp(ev);
	};

	const onWheel = (_ev: WheelEvent): void => {
		// No-op: wheel events pass through to widgets/grid for scroll
	};

	const onPointerDownEvent = onPointerDown as EventListener;
	const onPointerMoveEvent = onPointerMove as EventListener;
	const onPointerUpEvent = onPointerUp as EventListener;
	const onMouseDownEvent = onMouseDown as EventListener;
	const onMouseMoveEvent = onMouseMove as EventListener;
	const onMouseUpEvent = onMouseUp as EventListener;
	const onClickEvent = onClick as EventListener;
	const onWheelEvent = onWheel as EventListener;

	container.addEventListener("pointerdown", onPointerDownEvent, true);
	container.addEventListener("pointermove", onPointerMoveEvent);
	container.addEventListener("pointerup", onPointerUpEvent);
	container.addEventListener("mousedown", onMouseDownEvent, true);
	container.addEventListener("mousemove", onMouseMoveEvent);
	container.addEventListener("mouseup", onMouseUpEvent);
	document.addEventListener("pointermove", onPointerMove);
	document.addEventListener("pointerup", onPointerUp);
	document.addEventListener("mousemove", onMouseMove);
	document.addEventListener("mouseup", onMouseUp);
	container.addEventListener("click", onClickEvent, true);

	container.addEventListener("wheel", onWheelEvent, { passive: false });

	return () => {
		container.removeEventListener("pointerdown", onPointerDownEvent, true);
		container.removeEventListener("pointermove", onPointerMoveEvent);
		container.removeEventListener("pointerup", onPointerUpEvent);
		container.removeEventListener("mousedown", onMouseDownEvent, true);
		container.removeEventListener("mousemove", onMouseMoveEvent);
		container.removeEventListener("mouseup", onMouseUpEvent);
		document.removeEventListener("pointermove", onPointerMove);
		document.removeEventListener("pointerup", onPointerUp);
		document.removeEventListener("mousemove", onMouseMove);
		document.removeEventListener("mouseup", onMouseUp);
		container.removeEventListener("click", onClickEvent, true);

		container.removeEventListener("wheel", onWheelEvent);
	};
};

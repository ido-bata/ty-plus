/**
 * Cross-widget pointer-drag gesture hook.
 *
 * Extracted from `src/management/workspace/events/handler.ts`
 * (legacy `alignGesture` / `renderAlignGestureOverlay` / `ALIGN_GESTURE_MAP`).
 * Shared by `function/widget/core/align` and `function/widget/core/anchor-point`.
 *
 * Behavior contract (matches the workspace-level implementation that previously
 * wrapped the alignment widget, plus the additions requested by Issue #77):
 *
 *   1. Press (left mouse button only, no modifiers: Ctrl / Meta / Shift)
 *      starts the gesture at the cursor's local position inside the target ref.
 *      `Alt` is intentionally NOT excluded: the original alignment convention
 *      (`isAlignGestureStart` in `management/workspace/events/handler.ts`)
 *      allowed Alt-key drags; see `docs/architecture/widget/anchor-point.md`
 *      for the rationale and unimplemented fine-adjustment behavior.
 *   2. Pointer capture is taken on the widget element so subsequent moves and
 *      the release fire even when the pointer leaves the widget bounds.
 *   3. Each segment commits a direction (`left` | `right` | `top` | `bottom`)
 *      once the cursor travels `segmentThreshold` (default 25) pixels in a
 *      consistent direction. Up to 3 most-recent segments are kept, enabling
 *      L-shape ("right-left") recognition through the `config.map`.
 *   4. On release, when the cursor has moved at least `clickThreshold`
 *      (default 5) pixels from the start point and an action was recognized,
 *      `onRecognize(action)` is called once.
 *   5. IME composition state on the synthetic event is short-circuited so an
 *      Enter-key during Japanese input cannot begin a gesture.
 *   6. Start conditions are filtered before `event.preventDefault()` is
 *      called. Consumers can opt into the legacy alignment guards via:
 *        - `config.actionSelector` (default `[data-ws-action]`) — clicks on
 *          matching controls (or descendants) do not start a gesture.
 *        - `config.resizeMargin` — pointerdowns within this many pixels of
 *          the target ref's edge are excluded so the surrounding tile
 *          resize handle wins.
 *        - `config.dragHandleMargin` — pointerdowns within this many pixels
 *          of the target ref's edge are excluded so the surrounding tile
 *          move handle wins. Setting only this still excludes the smaller
 *          resize margin.
 *      When none of the action / resize / drag-handle guards are configured
 *      the hook degrades to a plain left-button gate, matching the
 *      `function/widget/core/anchor-point` widget's original behavior.
 *
 * Consumers render the path overlay themselves using the exposed
 * `state.path`, `state.isActive`, and `state.recognizedAction`.
 */

import {
	type MouseEvent as ReactMouseEvent,
	type PointerEvent as ReactPointerEvent,
	type RefObject,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";

import { isIMEComposing } from "@/shared/util/keyboard";

/** Two-dimensional local widget point. */
export type GesturePoint = Readonly<{ x: number; y: number }>;

/** Cardinally snapped direction committed to a segment. */
export type GestureDirection = "left" | "right" | "top" | "bottom";

/** Generic hook config. The action type is provided by the caller. */
export type AnchorGestureConfig<T extends string> = {
	/**
	 * Recognition map keyed by either a single direction (e.g. `"right"`) or
	 * a hyphen-joined sequence of up-to-3 most-recent directions
	 * (e.g. `"right-left"` for an L-shape). Sequence lookups are preferred
	 * over single-direction fallbacks.
	 */
	map: Readonly<Record<string, T>>;
	/** Minimum travel before a new segment is committed. Default `25`. */
	segmentThreshold?: number;
	/** Minimum total travel before a release fires `onRecognize`. Default `5`. */
	clickThreshold?: number;
	/**
	 * Selector matching action controls (e.g. `[data-ws-action]`). When set,
	 * a pointerdown whose target matches (or descends from) the selector
	 * will not start a gesture — matching the legacy
	 * `isAlignGestureStart` guard `!target.closest("[data-ws-action]")`.
	 * Pass `null` to opt out. Default: `[data-ws-action]`.
	 */
	actionSelector?: string | null;
	/**
	 * Pixel distance from the target ref's edge that is reserved for the
	 * surrounding tile's resize handle. Pointerdowns closer than this are
	 * excluded so the resize gesture wins. Pass `null` to opt out.
	 * Default: `null` (no resize guard).
	 */
	resizeMargin?: number | null;
	/**
	 * Pixel distance from the target ref's edge that is reserved for the
	 * surrounding tile's drag-handle (move) area. Pointerdowns closer than
	 * this are excluded so the move gesture wins. Pass `null` to opt out.
	 * Setting a value implicitly also excludes the smaller resize zone.
	 * Default: `null` (no drag-handle guard).
	 */
	dragHandleMargin?: number | null;
};

/** Public default constants so tests and widgets reference the same numbers. */
const DEFAULT_GESTURE_THRESHOLD = 25;
const DEFAULT_CLICK_THRESHOLD = 5;
/** Window for treating a mouse event as the twin of a pointer event. */
const POINTER_MOUSE_DEDUP_MS = 16;

/** Default action-control selector for the legacy alignment convention. */
const DEFAULT_ACTION_SELECTOR = "[data-ws-action]";

/** Snap a 2D delta to one of four cardinal directions. */
export const gestureDirection = (dx: number, dy: number): GestureDirection => {
	const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
	if (angle >= -45 && angle < 45) return "right";
	if (angle >= 45 && angle < 135) return "bottom";
	if (angle >= 135 || angle < -135) return "left";
	return "top";
};

/** Read-only view of the gesture state for rendering. */
export type AnchorGestureState = Readonly<{
	isActive: boolean;
	path: ReadonlyArray<GesturePoint>;
	recognizedAction: string | null;
}>;

/** Wire the hook to the widget's action runner. */
export type AnchorGestureRecognizeFn<T extends string> = (action: T) => void;

type SyntheticPointerEvent =
	| ReactPointerEvent<HTMLElement>
	| ReactMouseEvent<HTMLElement>;

const setPointerCaptureSafely = (
	target: EventTarget | null,
	pointerId: number,
): void => {
	const el = target as
		| (Element & {
				setPointerCapture?: (id: number) => void;
		  })
		| null;
	if (!el || typeof el.setPointerCapture !== "function") return;
	try {
		el.setPointerCapture(pointerId);
	} catch {
		// Some CEP runtimes can reject capture; the gesture still works without it.
	}
};

const isPlainLeftMouseEvent = (event: SyntheticPointerEvent): boolean => {
	if (typeof event.button !== "number") return true;
	if (event.button !== 0) return false;
	// NOTE: `altKey` is intentionally NOT excluded. The original alignment
	// convention (`isAlignGestureStart` in `management/workspace/events/handler.ts`)
	// allowed Alt-key drags. See the module header and
	// `docs/architecture/widget/anchor-point.md` for the rationale and
	// unimplemented fine-adjustment behavior.
	if (event.metaKey) return false;
	if (event.ctrlKey) return false;
	if (event.shiftKey) return false;
	return true;
};

/** True iff `el` matches `selector` or descends from a matching element. */
const matchesSelector = (el: EventTarget | null, selector: string): boolean => {
	if (!el || typeof el !== "object") return false;
	if (typeof (el as Element).closest !== "function") return false;
	return Boolean((el as Element).closest(selector));
};

type EdgeInfo = {
	n: boolean;
	s: boolean;
	e: boolean;
	w: boolean;
};

/** Returns true if `pointer` is within `margin` of any edge of `el`. */
const isInEdgeZone = (
	pointerX: number,
	pointerY: number,
	el: Element,
	margin: number,
): boolean => {
	const r = el.getBoundingClientRect();
	const x = pointerX - r.left;
	const y = pointerY - r.top;
	return (
		x <= margin ||
		x >= r.width - margin ||
		y <= margin ||
		y >= r.height - margin
	);
};

/** Public helper: returns resize edge info for the legacy convention. */
const getEdgeInfo = (
	pointerX: number,
	pointerY: number,
	el: Element,
	margin: number,
): EdgeInfo | null => {
	const r = el.getBoundingClientRect();
	const x = pointerX - r.left;
	const y = pointerY - r.top;
	const n = y < margin;
	const s = y > r.height - margin;
	const ew = x < margin;
	const ee = x > r.width - margin;
	if (!n && !s && !ew && !ee) return null;
	return { n, s, e: ee, w: ew };
};

/**
 * Hook signature. `targetRef` points at the widget root whose bounds the
 * gesture coordinates are normalized against. `imeComposingRef` lets parents
 * propagate a top-level IME composition flag (e.g., from a wrapping keydown
 * listener) so Enter during Japanese input cannot start a drag. Pass
 * `enabled: false` (default `true`) to disable the gesture entirely: the
 * hook still attaches its listener, but `onPointerDown` falls through to
 * the native button-click path without `preventDefault`,
 * `setPointerCapture`, or any state mutation.
 */
export function useAnchorGesture<T extends string>({
	targetRef,
	config,
	onRecognize,
	imeComposingRef,
	enabled = true,
}: {
	targetRef: RefObject<HTMLElement | null>;
	config: AnchorGestureConfig<T>;
	onRecognize: AnchorGestureRecognizeFn<T>;
	imeComposingRef?: RefObject<boolean>;
	/** When `false`, the hook is a pass-through. Default `true`. */
	enabled?: boolean;
}): AnchorGestureState & {
	onPointerDown: (event: SyntheticPointerEvent) => void;
} {
	const segmentThreshold = config.segmentThreshold ?? DEFAULT_GESTURE_THRESHOLD;
	const clickThreshold = config.clickThreshold ?? DEFAULT_CLICK_THRESHOLD;
	const actionSelector =
		config.actionSelector === null
			? null
			: (config.actionSelector ?? DEFAULT_ACTION_SELECTOR);
	const resizeMargin =
		config.resizeMargin === null ? null : (config.resizeMargin ?? null);
	const dragHandleMargin =
		config.dragHandleMargin === null ? null : (config.dragHandleMargin ?? null);

	const [isActive, setIsActive] = useState(false);
	const [path, setPath] = useState<GesturePoint[]>([]);
	const [recognizedAction, setRecognizedAction] = useState<string | null>(null);

	const mouseDownPoint = useRef<GesturePoint | null>(null);
	const lastSegmentPoint = useRef<GesturePoint | null>(null);
	const detectedSegments = useRef<GestureDirection[]>([]);
	const recognizedRef = useRef<string | null>(null);
	const activeRef = useRef(false);

	const resetState = useCallback((): void => {
		mouseDownPoint.current = null;
		lastSegmentPoint.current = null;
		detectedSegments.current = [];
		recognizedRef.current = null;
		activeRef.current = false;
		setPath([]);
		setRecognizedAction(null);
		setIsActive(false);
	}, []);

	const onPointerDown = useCallback(
		(event: SyntheticPointerEvent) => {
			// Issue #78 settings opt-out: when the gesture is disabled, fall
			// through to the native button-click path. We must skip every
			// side-effect (preventDefault, setPointerCapture, state mutation)
			// so the widget's direct-click regression stays intact.
			if (!enabled) return;
			if (isIMEComposing(event as unknown as { isComposing?: boolean })) return;
			if (imeComposingRef?.current) return;
			if (!isPlainLeftMouseEvent(event)) return;
			const target = targetRef.current;
			if (!target) return;
			if (activeRef.current) return;

			// Legacy alignment guard #1: exclude action controls (e.g. buttons
			// carrying `data-ws-action`). Clicks on those still propagate to
			// their own onClick handlers because we bail before
			// `event.preventDefault()`.
			if (actionSelector && matchesSelector(event.target, actionSelector)) {
				return;
			}

			// Legacy alignment guard #2: exclude the tile resize zone. The
			// tile root owns this area; the widget gesture must yield.
			if (
				resizeMargin !== null &&
				isInEdgeZone(event.clientX, event.clientY, target, resizeMargin)
			) {
				return;
			}

			// Legacy alignment guard #3: exclude the tile drag-handle (move)
			// zone. The drag-handle area is the union of [0, dragHandleMargin]
			// from each edge; if either margin is set the pointerdown must be
			// strictly interior.
			if (
				dragHandleMargin !== null &&
				isInEdgeZone(event.clientX, event.clientY, target, dragHandleMargin)
			) {
				return;
			}

			event.preventDefault();
			const rect = target.getBoundingClientRect();
			const pt: GesturePoint = {
				x: event.clientX - rect.left,
				y: event.clientY - rect.top,
			};
			mouseDownPoint.current = pt;
			lastSegmentPoint.current = pt;
			detectedSegments.current = [];
			recognizedRef.current = null;
			activeRef.current = true;
			setPath([pt]);
			setRecognizedAction(null);
			setIsActive(true);

			const pointerId = (event as { pointerId?: number }).pointerId;
			if (typeof pointerId === "number") {
				setPointerCaptureSafely(event.currentTarget, pointerId);
			}
		},
		[
			targetRef,
			imeComposingRef,
			actionSelector,
			resizeMargin,
			dragHandleMargin,
			enabled,
		],
	);

	const onPointerDownRef = useRef(onPointerDown);
	useEffect(() => {
		onPointerDownRef.current = onPointerDown;
	}, [onPointerDown]);

	// Mouse fallback for CEP/CEF paths that deliver mousedown without
	// pointerdown. Attached natively on the target element so consumers do
	// not need a second JSX handler. When pointerdown did fire, the gesture
	// is already active (or was rejected by the same guards) and the shared
	// handler returns early via `activeRef`.
	useEffect(() => {
		const el = targetRef.current;
		if (!el) return;
		const handleMouseDown = (e: MouseEvent): void => {
			onPointerDownRef.current(e as unknown as SyntheticPointerEvent);
		};
		el.addEventListener("mousedown", handleMouseDown);
		return () => el.removeEventListener("mousedown", handleMouseDown);
	}, [targetRef]);

	useEffect(() => {
		if (!isActive) return;
		const target = targetRef.current;
		if (!target) return;

		// Some CEP/CEF input paths synthesize pointermove but never deliver
		// pointerdown/pointerup, so the gesture may be started by a mouse
		// event (see the mousedown listener above). Accept mousemove/mouseup
		// here as fallback and skip the twin of any pointer event that
		// arrived within the same gesture.
		let lastPointerMoveTs = 0;
		let lastPointerEndTs = 0;

		const handleMove = (e: PointerEvent | MouseEvent): void => {
			if (e.type === "pointermove") {
				lastPointerMoveTs = e.timeStamp;
			} else if (e.timeStamp - lastPointerMoveTs < POINTER_MOUSE_DEDUP_MS) {
				return;
			}
			const last = lastSegmentPoint.current;
			if (!last) return;
			const rect = target.getBoundingClientRect();
			const pt: GesturePoint = {
				x: e.clientX - rect.left,
				y: e.clientY - rect.top,
			};
			setPath((prev) => [...prev, pt]);

			const dx = pt.x - last.x;
			const dy = pt.y - last.y;
			const dist = Math.hypot(dx, dy);
			if (dist >= segmentThreshold) {
				const dir = gestureDirection(dx, dy);
				const segs = detectedSegments.current;
				if (segs.length === 0 || segs[segs.length - 1] !== dir) {
					segs.push(dir);
					if (segs.length > 3) segs.shift();
					const seq = segs.join("-");
					const next = config.map[seq] ?? config.map[dir] ?? null;
					recognizedRef.current = next;
					setRecognizedAction(next);
					lastSegmentPoint.current = pt;
				}
			}
		};

		const handleEnd = (e: PointerEvent | MouseEvent): void => {
			if (e.type === "pointerup" || e.type === "pointercancel") {
				lastPointerEndTs = e.timeStamp;
			} else if (e.timeStamp - lastPointerEndTs < POINTER_MOUSE_DEDUP_MS) {
				return;
			}
			const start = mouseDownPoint.current;
			const final = recognizedRef.current;
			if (start && final) {
				const rect = target.getBoundingClientRect();
				const release: GesturePoint = {
					x: e.clientX - rect.left,
					y: e.clientY - rect.top,
				};
				const total = Math.hypot(release.x - start.x, release.y - start.y);
				if (total >= clickThreshold) {
					onRecognize(final as T);
				}
			}
			resetState();
		};

		document.addEventListener("pointermove", handleMove);
		document.addEventListener("pointerup", handleEnd);
		document.addEventListener("pointercancel", handleEnd);
		document.addEventListener("mousemove", handleMove);
		document.addEventListener("mouseup", handleEnd);
		return () => {
			document.removeEventListener("pointermove", handleMove);
			document.removeEventListener("pointerup", handleEnd);
			document.removeEventListener("pointercancel", handleEnd);
			document.removeEventListener("mousemove", handleMove);
			document.removeEventListener("mouseup", handleEnd);
		};
	}, [
		isActive,
		targetRef,
		config.map,
		segmentThreshold,
		clickThreshold,
		onRecognize,
		resetState,
	]);

	return {
		isActive,
		path,
		recognizedAction,
		onPointerDown,
	};
}

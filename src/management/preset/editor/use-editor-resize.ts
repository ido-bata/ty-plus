import {
	type MouseEvent as ReactMouseEvent,
	type PointerEvent as ReactPointerEvent,
	useCallback,
	useRef,
	useState,
} from "react";

/**
 * Bottom-edge resize gesture for the preset code editor.
 *
 * Extracted from `Code.tsx` so the editor component stays under the
 * react-doctor giant-component threshold. Some CEP/CEF input paths never
 * deliver pointerdown/pointerup (only pointermove is synthesized), so a
 * mouse fallback starts the same gesture and tracks the drag on window —
 * mouse events have no pointer capture, and the cursor must be able to
 * leave the handle mid-resize. `minHeight`/`maxHeight` come from the
 * caller so the clamp constants stay next to the JSX that exposes them
 * via aria attributes.
 */

/** Window for treating a mouse event as the twin of a pointer event. */
const POINTER_MOUSE_DEDUP_MS = 16;

export type ResizeGestureEvent =
	| ReactPointerEvent<HTMLDivElement>
	| ReactMouseEvent<HTMLDivElement>;

export function useEditorResize({
	minHeight,
	maxHeight,
}: {
	minHeight: number;
	maxHeight: number;
}): {
	editorHeight: number;
	onResizeStart: (event: ResizeGestureEvent) => void;
	onResizeMove: (event: ResizeGestureEvent) => void;
	onResizeEnd: (event: ResizeGestureEvent) => void;
	onResizeMouseStart: (event: ReactMouseEvent<HTMLDivElement>) => void;
} {
	const [editorHeight, setEditorHeight] = useState(minHeight);
	const resizeOriginRef = useRef<{
		startY: number;
		startHeight: number;
		pointerId?: number;
	} | null>(null);
	// Timestamps of the last pointer events, used to skip the mouse-event
	// twin in CEP/CEF paths that deliver both (or only mouse events).
	const lastPointerTsRef = useRef({ down: 0, move: 0, up: 0 });

	const handleResizeStart = useCallback(
		(event: ResizeGestureEvent) => {
			if (event.type === "pointerdown") {
				lastPointerTsRef.current.down = event.timeStamp;
			}
			event.preventDefault();
			const pointerId = (event as { pointerId?: number }).pointerId;
			resizeOriginRef.current = {
				startY: event.clientY,
				startHeight: editorHeight,
				pointerId,
			};
			if (typeof pointerId === "number") {
				event.currentTarget.setPointerCapture(pointerId);
			}
		},
		[editorHeight],
	);

	const handleResizeMove = useCallback(
		(event: ResizeGestureEvent) => {
			if (event.type === "pointermove") {
				lastPointerTsRef.current.move = event.timeStamp;
			}
			const origin = resizeOriginRef.current;
			if (!origin) return;
			const dy = event.clientY - origin.startY;
			const nextHeight = Math.max(
				minHeight,
				Math.min(maxHeight, origin.startHeight + dy),
			);
			setEditorHeight(nextHeight);
		},
		[minHeight, maxHeight],
	);

	const handleResizeEnd = useCallback((event: ResizeGestureEvent) => {
		if (event.type === "pointerup" || event.type === "pointercancel") {
			lastPointerTsRef.current.up = event.timeStamp;
		}
		const origin = resizeOriginRef.current;
		if (!origin) return;
		resizeOriginRef.current = null;
		const el = event.currentTarget as HTMLElement | null;
		if (
			typeof origin.pointerId === "number" &&
			el &&
			typeof el.hasPointerCapture === "function" &&
			el.hasPointerCapture(origin.pointerId)
		) {
			el.releasePointerCapture(origin.pointerId);
		}
	}, []);

	// Mouse fallback for CEP/CEF paths that never deliver pointerdown/up.
	const handleResizeMouseStart = useCallback(
		(event: ReactMouseEvent<HTMLDivElement>) => {
			if (
				event.timeStamp - lastPointerTsRef.current.down <
				POINTER_MOUSE_DEDUP_MS
			) {
				return;
			}
			handleResizeStart(event);
			const onWinMove = (ev: MouseEvent): void => {
				handleResizeMove(ev as unknown as ResizeGestureEvent);
			};
			const onWinUp = (ev: MouseEvent): void => {
				handleResizeEnd(ev as unknown as ResizeGestureEvent);
				window.removeEventListener("mousemove", onWinMove);
				window.removeEventListener("mouseup", onWinUp);
			};
			window.addEventListener("mousemove", onWinMove);
			window.addEventListener("mouseup", onWinUp);
		},
		[handleResizeStart, handleResizeMove, handleResizeEnd],
	);

	return {
		editorHeight,
		onResizeStart: handleResizeStart,
		onResizeMove: handleResizeMove,
		onResizeEnd: handleResizeEnd,
		onResizeMouseStart: handleResizeMouseStart,
	};
}

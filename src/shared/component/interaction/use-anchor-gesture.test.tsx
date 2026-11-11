/**
 * @vitest-environment jsdom
 *
 * Unit tests for the cross-widget pointer-drag gesture hook
 * (Issue #77). Drives the hook through a probe component so we can
 * observe its state at every step of a press → drag → release cycle.
 */

import {
	act,
	cleanup,
	fireEvent,
	type RenderHookOptions,
	render,
	renderHook,
} from "@testing-library/react";
import type { ReactElement, RefObject } from "react";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
	type GesturePoint,
	gestureDirection,
	useAnchorGesture,
} from "./use-anchor-gesture";

type Action = "top" | "left" | "right" | "center";

const GESTURE_MAP = {
	left: "left",
	right: "right",
	top: "top",
	"right-left": "center",
} as const satisfies Record<string, Action>;

type ProbeState = {
	isActive: boolean;
	path: ReadonlyArray<GesturePoint>;
	recognizedAction: string | null;
};

type ProbeProps = {
	map?: Record<string, Action>;
	segmentThreshold?: number;
	clickThreshold?: number;
	actionSelector?: string | null;
	resizeMargin?: number | null;
	dragHandleMargin?: number | null;
	enabled?: boolean;
	onRecognize: (action: Action) => void;
	stateRef: { current: ProbeState };
};

function Probe({
	map = GESTURE_MAP,
	segmentThreshold,
	clickThreshold,
	actionSelector,
	resizeMargin,
	dragHandleMargin,
	enabled,
	onRecognize,
	stateRef,
}: ProbeProps): ReactElement {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const config: Parameters<typeof useAnchorGesture<Action>>[0]["config"] = {
		map,
		segmentThreshold,
		clickThreshold,
	};
	if (actionSelector !== undefined) {
		config.actionSelector = actionSelector;
	}
	if (resizeMargin !== undefined) {
		config.resizeMargin = resizeMargin;
	}
	if (dragHandleMargin !== undefined) {
		config.dragHandleMargin = dragHandleMargin;
	}
	const hookArgs: Parameters<typeof useAnchorGesture<Action>>[0] = {
		targetRef: containerRef,
		config,
		onRecognize,
	};
	if (enabled !== undefined) {
		hookArgs.enabled = enabled;
	}
	const gesture = useAnchorGesture<Action>(hookArgs);
	stateRef.current = {
		isActive: gesture.isActive,
		path: gesture.path,
		recognizedAction: gesture.recognizedAction,
	};
	return (
		<div data-testid="probe-root" style={{ width: 200, height: 200 }}>
			<div
				ref={containerRef}
				data-testid="probe-target"
				role="application"
				tabIndex={-1}
				style={{ width: 200, height: 200, boxSizing: "border-box" }}
				onPointerDown={gesture.onPointerDown}
			>
				probe
			</div>
		</div>
	);
}

const renderProbe = (
	overrides: Partial<ProbeProps> & { onRecognize: (a: Action) => void },
) => {
	const stateRef: { current: ProbeState } = {
		current: { isActive: false, path: [], recognizedAction: null },
	};
	const props = { stateRef, ...overrides };
	const view = render(<Probe {...props} />);
	const target = document.querySelector(
		"[data-testid='probe-target']",
	) as HTMLDivElement;
	return { ...view, target, stateRef };
};

describe("useAnchorGesture", () => {
	afterEach(() => {
		cleanup();
	});

	describe("gestureDirection", () => {
		it("snaps positive x delta to 'right'", () => {
			expect(gestureDirection(10, 0)).toBe("right");
		});

		it("snaps positive y delta to 'bottom'", () => {
			expect(gestureDirection(0, 10)).toBe("bottom");
		});

		it("snaps negative x delta to 'left'", () => {
			expect(gestureDirection(-10, 0)).toBe("left");
		});

		it("snaps negative y delta to 'top'", () => {
			expect(gestureDirection(0, -10)).toBe("top");
		});

		it("snaps 45-135 degree diagonals to vertical", () => {
			expect(gestureDirection(1, 10)).toBe("bottom");
		});

		it("snaps -45 to 45 degree diagonals to horizontal", () => {
			expect(gestureDirection(10, 1)).toBe("right");
		});
	});

	describe("state transitions", () => {
		it("starts inactive with an empty path and null action", () => {
			const onRecognize = vi.fn();
			const { stateRef } = renderProbe({ onRecognize });
			expect(stateRef.current.isActive).toBe(false);
			expect(stateRef.current.path).toEqual([]);
			expect(stateRef.current.recognizedAction).toBeNull();
			expect(onRecognize).not.toHaveBeenCalled();
		});

		it("activates on plain left-button pointerdown and tracks the start point", () => {
			const { target, stateRef } = renderProbe({ onRecognize: vi.fn() });
			expect(target).toBeTruthy();

			fireEvent.pointerDown(target, {
				button: 0,
				clientX: 30,
				clientY: 40,
				pointerId: 1,
			});
			expect(stateRef.current.isActive).toBe(true);
			expect(stateRef.current.path.length).toBe(1);
			expect(stateRef.current.path[0]).toEqual({ x: 30, y: 40 });
		});
	});

	describe("modifier and IME gates", () => {
		const cases: Array<
			[
				name: string,
				opts: {
					button?: number;
					altKey?: boolean;
					metaKey?: boolean;
					ctrlKey?: boolean;
					shiftKey?: boolean;
				},
			]
		> = [
			["Meta key", { metaKey: true }],
			["Ctrl key", { ctrlKey: true }],
			["Shift key", { shiftKey: true }],
			["right mouse button", { button: 2 }],
		];

		it.each(cases)("ignores pointerdown when %s is pressed", (_name, opts) => {
			const onRecognize = vi.fn();
			const { target, stateRef } = renderProbe({ onRecognize });
			fireEvent.pointerDown(target, {
				button: 0,
				clientX: 50,
				clientY: 50,
				pointerId: 1,
				...opts,
			});
			expect(stateRef.current.isActive).toBe(false);
			expect(onRecognize).not.toHaveBeenCalled();
		});

		it("starts the gesture when Alt is pressed (matches original alignment convention)", () => {
			const onRecognize = vi.fn();
			const { target, stateRef } = renderProbe({ onRecognize });
			fireEvent.pointerDown(target, {
				button: 0,
				clientX: 50,
				clientY: 50,
				pointerId: 1,
				altKey: true,
			});
			expect(stateRef.current.isActive).toBe(true);
			expect(onRecognize).not.toHaveBeenCalled();
		});

		it("ignores pointerdown when imeComposingRef is true", () => {
			const onRecognize = vi.fn();
			const imeRef: { current: boolean } = { current: true };
			const containerRef: RefObject<HTMLDivElement | null> = { current: null };
			const { result } = renderHook(() =>
				useAnchorGesture<Action>({
					targetRef: containerRef,
					config: { map: GESTURE_MAP },
					onRecognize,
					imeComposingRef: imeRef as RefObject<boolean>,
				}),
			);
			// Drive a synthetic pointerdown through the hook's onPointerDown directly.
			act(() => {
				result.current.onPointerDown({
					button: 0,
					clientX: 50,
					clientY: 50,
					pointerId: 1,
					currentTarget: null,
					preventDefault: () => undefined,
				} as unknown as Parameters<typeof result.current.onPointerDown>[0]);
			});
			expect(result.current.isActive).toBe(false);
			expect(onRecognize).not.toHaveBeenCalled();
		});
	});

	describe("legacy alignment guards", () => {
		// Probe variant with an action button inside the target so we can
		// drive pointerdown events at the button and observe the
		// action-selector guard.
		function ProbeWithAction({
			onRecognize,
			stateRef,
			actionSelector,
		}: {
			onRecognize: (a: Action) => void;
			stateRef: { current: ProbeState };
			actionSelector?: string | null;
		}): ReactElement {
			const containerRef = useRef<HTMLDivElement | null>(null);
			const config: Parameters<typeof useAnchorGesture<Action>>[0]["config"] = {
				map: GESTURE_MAP,
			};
			if (actionSelector !== undefined) config.actionSelector = actionSelector;
			const gesture = useAnchorGesture<Action>({
				targetRef: containerRef,
				config,
				onRecognize,
			});
			stateRef.current = {
				isActive: gesture.isActive,
				path: gesture.path,
				recognizedAction: gesture.recognizedAction,
			};
			return (
				<div
					ref={containerRef}
					data-testid="legacy-target"
					role="application"
					tabIndex={-1}
					style={{ width: 200, height: 200 }}
					onPointerDown={gesture.onPointerDown}
				>
					<button
						type="button"
						data-ws-action="anchor-point"
						data-testid="legacy-action"
					>
						action
					</button>
				</div>
			);
		}

		it("does not start a gesture when the pointerdown target is inside a [data-ws-action] control", () => {
			const onRecognize = vi.fn();
			const stateRef: { current: ProbeState } = {
				current: { isActive: false, path: [], recognizedAction: null },
			};
			const { container } = render(
				<ProbeWithAction onRecognize={onRecognize} stateRef={stateRef} />,
			);
			const actionBtn = container.querySelector(
				"[data-testid='legacy-action']",
			) as HTMLButtonElement;
			fireEvent.pointerDown(actionBtn, {
				button: 0,
				clientX: 50,
				clientY: 50,
				pointerId: 1,
			});
			expect(stateRef.current.isActive).toBe(false);
			expect(onRecognize).not.toHaveBeenCalled();
		});

		it("does not start a gesture when the action-selector guard is disabled", () => {
			// Sanity: opt-out (actionSelector === null) restores the
			// pre-guard behavior, allowing pointerdowns on data-ws-action
			// buttons to start the gesture.
			const onRecognize = vi.fn();
			const stateRef: { current: ProbeState } = {
				current: { isActive: false, path: [], recognizedAction: null },
			};
			const { container } = render(
				<ProbeWithAction
					onRecognize={onRecognize}
					stateRef={stateRef}
					actionSelector={null}
				/>,
			);
			const actionBtn = container.querySelector(
				"[data-testid='legacy-action']",
			) as HTMLButtonElement;
			fireEvent.pointerDown(actionBtn, {
				button: 0,
				clientX: 50,
				clientY: 50,
				pointerId: 1,
			});
			expect(stateRef.current.isActive).toBe(true);
			expect(onRecognize).not.toHaveBeenCalled();
		});

		it("does not start a gesture when the pointer is inside the resize-margin zone", () => {
			const onRecognize = vi.fn();
			const { target, stateRef } = renderProbe({
				onRecognize,
				resizeMargin: 12,
				dragHandleMargin: 16,
			});
			// jsdom reports zero-size rects; stub the rect to a 200x200 box at
			// (0,0) so margin math is exercised against real numbers.
			vi.spyOn(target, "getBoundingClientRect").mockReturnValue({
				x: 0,
				y: 0,
				left: 0,
				top: 0,
				right: 200,
				bottom: 200,
				width: 200,
				height: 200,
				toJSON: () => ({}),
			});
			// clientX=4 is inside the [0,12] resize zone on the left edge.
			fireEvent.pointerDown(target, {
				button: 0,
				clientX: 4,
				clientY: 100,
				pointerId: 1,
			});
			expect(stateRef.current.isActive).toBe(false);
			expect(onRecognize).not.toHaveBeenCalled();
		});

		it("does not start a gesture when the pointer is inside the drag-handle zone but outside the resize zone", () => {
			const onRecognize = vi.fn();
			const { target, stateRef } = renderProbe({
				onRecognize,
				resizeMargin: 12,
				dragHandleMargin: 16,
			});
			vi.spyOn(target, "getBoundingClientRect").mockReturnValue({
				x: 0,
				y: 0,
				left: 0,
				top: 0,
				right: 200,
				bottom: 200,
				width: 200,
				height: 200,
				toJSON: () => ({}),
			});
			// clientX=14 sits in the (12, 16] drag-handle-only band.
			fireEvent.pointerDown(target, {
				button: 0,
				clientX: 14,
				clientY: 100,
				pointerId: 1,
			});
			expect(stateRef.current.isActive).toBe(false);
			expect(onRecognize).not.toHaveBeenCalled();
		});

		it("starts the gesture when the pointer is strictly inside the widget", () => {
			const onRecognize = vi.fn();
			const { target, stateRef } = renderProbe({
				onRecognize,
				resizeMargin: 12,
				dragHandleMargin: 16,
			});
			vi.spyOn(target, "getBoundingClientRect").mockReturnValue({
				x: 0,
				y: 0,
				left: 0,
				top: 0,
				right: 200,
				bottom: 200,
				width: 200,
				height: 200,
				toJSON: () => ({}),
			});
			fireEvent.pointerDown(target, {
				button: 0,
				clientX: 50,
				clientY: 100,
				pointerId: 1,
			});
			expect(stateRef.current.isActive).toBe(true);
			expect(onRecognize).not.toHaveBeenCalled();
		});

		it("does not call preventDefault when the action-selector guard excludes the target", () => {
			const onRecognize = vi.fn();
			const stateRef: { current: ProbeState } = {
				current: { isActive: false, path: [], recognizedAction: null },
			};
			const preventDefault = vi.fn();
			const { container } = render(
				<ProbeWithAction onRecognize={onRecognize} stateRef={stateRef} />,
			);
			const actionBtn = container.querySelector(
				"[data-testid='legacy-action']",
			) as HTMLButtonElement;
			// Stub preventDefault on the button so we can assert it is never
			// invoked when the guard rejects the event.
			actionBtn.addEventListener(
				"pointerdown",
				(e) => {
					e.preventDefault = preventDefault;
				},
				true,
			);
			fireEvent.pointerDown(actionBtn, {
				button: 0,
				clientX: 50,
				clientY: 50,
				pointerId: 1,
			});
			expect(stateRef.current.isActive).toBe(false);
			expect(preventDefault).not.toHaveBeenCalled();
		});

		it("leaves the click event on a [data-ws-action] button intact (preventDefault scope)", () => {
			// Issue #77 review fix: limit preventDefault to when every guard
			// accepts the pointerdown, so the widget's direct-click path
			// keeps working. Regression check.
			const onRecognize = vi.fn();
			const onButtonClick = vi.fn();
			const { container } = render(
				<div data-testid="pd-scope-root" style={{ width: 200, height: 200 }}>
					<button
						type="button"
						data-ws-action="anchor-point"
						data-testid="pd-scope-action"
						onClick={onButtonClick}
					>
						action
					</button>
				</div>,
			);
			const root = container.querySelector(
				"[data-testid='pd-scope-root']",
			) as HTMLDivElement;
			const targetRef: RefObject<HTMLDivElement | null> = {
				current: root,
			};
			const { result } = renderHook(() =>
				useAnchorGesture<Action>({
					targetRef,
					config: { map: GESTURE_MAP },
					onRecognize,
				}),
			);
			const actionBtn = container.querySelector(
				"[data-testid='pd-scope-action']",
			) as HTMLButtonElement;
			fireEvent.pointerDown(actionBtn, {
				button: 0,
				clientX: 50,
				clientY: 50,
				pointerId: 1,
			});
			fireEvent.pointerUp(actionBtn, {
				button: 0,
				clientX: 50,
				clientY: 50,
				pointerId: 1,
			});
			fireEvent.click(actionBtn);
			expect(result.current.isActive).toBe(false);
			expect(onRecognize).not.toHaveBeenCalled();
			expect(onButtonClick).toHaveBeenCalledTimes(1);
		});

		it("leaves the workspace tile-root listener intact when the resize-margin guard rejects (preventDefault scope)", () => {
			// The workspace drag / resize listeners are attached above the
			// widget root. When the resize-margin guard rejects the
			// pointerdown, the hook must not start a gesture and the event
			// must still reach the higher listener so the tile drag/resize
			// path keeps working.
			const onRecognize = vi.fn();
			const onTilePointerDown = vi.fn();
			const targetRef: RefObject<HTMLDivElement | null> = {
				current: null,
			};
			const Stub = (): ReactElement => {
				const localRef = useRef<HTMLDivElement | null>(null);
				targetRef.current = localRef.current;
				const gesture = useAnchorGesture<Action>({
					targetRef: localRef,
					config: {
						map: GESTURE_MAP,
						resizeMargin: 12,
						dragHandleMargin: 16,
					},
					onRecognize,
				});
				return (
					<div data-testid="pd-tile-root" onPointerDown={onTilePointerDown}>
						<div
							ref={localRef}
							data-testid="pd-tile-widget"
							style={{ width: 200, height: 200, boxSizing: "border-box" }}
							onPointerDown={(e) => gesture.onPointerDown(e)}
						/>
					</div>
				);
			};
			render(<Stub />);
			const widget = document.querySelector(
				"[data-testid='pd-tile-widget']",
			) as HTMLDivElement;
			vi.spyOn(widget, "getBoundingClientRect").mockReturnValue({
				x: 0,
				y: 0,
				left: 0,
				top: 0,
				right: 200,
				bottom: 200,
				width: 200,
				height: 200,
				toJSON: () => ({}),
			});
			fireEvent.pointerDown(widget, {
				button: 0,
				clientX: 4,
				clientY: 100,
				pointerId: 1,
			});
			expect(onRecognize).not.toHaveBeenCalled();
			expect(onTilePointerDown).toHaveBeenCalled();
		});
	});

	describe("segment recognition", () => {
		it("commits a single direction once the cursor travels the segment threshold", () => {
			const { target, stateRef } = renderProbe({ onRecognize: vi.fn() });

			fireEvent.pointerDown(target, {
				button: 0,
				clientX: 10,
				clientY: 100,
				pointerId: 1,
			});
			expect(stateRef.current.recognizedAction).toBeNull();

			act(() => {
				fireEvent.pointerMove(document, {
					button: 0,
					clientX: 60,
					clientY: 100,
					pointerId: 1,
				});
			});
			expect(stateRef.current.recognizedAction).toBe("right");
			expect(stateRef.current.path[stateRef.current.path.length - 1]).toEqual({
				x: 60,
				y: 100,
			});
		});

		it("recognizes an L-shape (right → left) sequence as 'center'", () => {
			const onRecognize = vi.fn();
			const { target, stateRef } = renderProbe({ onRecognize });

			fireEvent.pointerDown(target, {
				button: 0,
				clientX: 30,
				clientY: 100,
				pointerId: 1,
			});

			act(() => {
				fireEvent.pointerMove(document, {
					button: 0,
					clientX: 70,
					clientY: 100,
					pointerId: 1,
				});
			});
			expect(stateRef.current.recognizedAction).toBe("right");

			act(() => {
				fireEvent.pointerMove(document, {
					button: 0,
					clientX: 30,
					clientY: 100,
					pointerId: 1,
				});
			});
			expect(stateRef.current.recognizedAction).toBe("center");

			// Release at a distinct endpoint so the click threshold passes.
			act(() => {
				fireEvent.pointerUp(document, {
					button: 0,
					clientX: 10,
					clientY: 100,
					pointerId: 1,
				});
			});
			expect(onRecognize).toHaveBeenCalledTimes(1);
			expect(onRecognize).toHaveBeenCalledWith("center");
			expect(stateRef.current.isActive).toBe(false);
		});

		it("does not call onRecognize when total travel stays below the click threshold", () => {
			const onRecognize = vi.fn();
			const { target } = renderProbe({ onRecognize });

			fireEvent.pointerDown(target, {
				button: 0,
				clientX: 50,
				clientY: 50,
				pointerId: 1,
			});
			act(() => {
				fireEvent.pointerMove(document, {
					button: 0,
					clientX: 52,
					clientY: 50,
					pointerId: 1,
				});
			});
			act(() => {
				fireEvent.pointerUp(document, {
					button: 0,
					clientX: 52,
					clientY: 50,
					pointerId: 1,
				});
			});
			expect(onRecognize).not.toHaveBeenCalled();
		});

		it("does not commit a segment for travel below the segment threshold", () => {
			const { target, stateRef } = renderProbe({ onRecognize: vi.fn() });

			fireEvent.pointerDown(target, {
				button: 0,
				clientX: 30,
				clientY: 100,
				pointerId: 1,
			});
			act(() => {
				fireEvent.pointerMove(document, {
					button: 0,
					clientX: 35,
					clientY: 100,
					pointerId: 1,
				});
			});
			expect(stateRef.current.recognizedAction).toBeNull();
		});
	});

	describe("active guard", () => {
		it("ignores a second pointerdown while the first gesture is still active", () => {
			const onRecognize = vi.fn();
			const { target, stateRef } = renderProbe({ onRecognize });

			fireEvent.pointerDown(target, {
				button: 0,
				clientX: 10,
				clientY: 10,
				pointerId: 1,
			});
			expect(stateRef.current.isActive).toBe(true);

			const startPathLength = stateRef.current.path.length;
			fireEvent.pointerDown(target, {
				button: 0,
				clientX: 50,
				clientY: 50,
				pointerId: 2,
			});
			expect(stateRef.current.path.length).toBe(startPathLength);
			expect(stateRef.current.isActive).toBe(true);
		});
	});

	describe("enabled flag (Issue #78 settings opt-out)", () => {
		it("falls through to native click path when enabled=false", () => {
			// Regression for the new `enabled` opt-out. When the user disables
			// gestures via Settings, the hook must not capture pointerdown
			// at all — no preventDefault, no setPointerCapture, no state
			// mutation — so the widget's direct-click path stays intact.
			const onRecognize = vi.fn();
			const { target, stateRef } = renderProbe({
				onRecognize,
				enabled: false,
			});
			fireEvent.pointerDown(target, {
				button: 0,
				clientX: 30,
				clientY: 30,
				pointerId: 1,
			});
			expect(stateRef.current.isActive).toBe(false);
			expect(stateRef.current.path).toEqual([]);
			expect(stateRef.current.recognizedAction).toBeNull();
			expect(onRecognize).not.toHaveBeenCalled();
		});

		it("does not call preventDefault when enabled=false", () => {
			const onRecognize = vi.fn();
			const preventDefault = vi.fn();
			const { target } = renderProbe({ onRecognize, enabled: false });
			// Attach a capturing listener so we can intercept the synthetic
			// event and stub its preventDefault before React's own handlers
			// run. If the hook called preventDefault, our spy would see it.
			target.addEventListener(
				"pointerdown",
				(e) => {
					e.preventDefault = preventDefault;
				},
				true,
			);
			fireEvent.pointerDown(target, {
				button: 0,
				clientX: 30,
				clientY: 30,
				pointerId: 1,
			});
			expect(preventDefault).not.toHaveBeenCalled();
		});

		it("does not attach document pointermove listeners when enabled=false", () => {
			const addSpy = vi.spyOn(document, "addEventListener");
			const onRecognize = vi.fn();
			const { target, stateRef } = renderProbe({
				onRecognize,
				enabled: false,
			});
			fireEvent.pointerDown(target, {
				button: 0,
				clientX: 30,
				clientY: 30,
				pointerId: 1,
			});
			expect(stateRef.current.isActive).toBe(false);
			// Even if a follow-up pointermove fires, the hook is not listening
			// — no document-level pointermove listener was attached.
			const moveAdds = addSpy.mock.calls.filter(
				([evName]) => evName === "pointermove",
			);
			expect(moveAdds.length).toBe(0);
		});

		it("still activates when enabled is true (default behavior is unchanged)", () => {
			const onRecognize = vi.fn();
			const { target, stateRef } = renderProbe({ onRecognize });
			fireEvent.pointerDown(target, {
				button: 0,
				clientX: 30,
				clientY: 30,
				pointerId: 1,
			});
			expect(stateRef.current.isActive).toBe(true);
		});

		it("stops a gesture when toggling from true to false mid-press", () => {
			// Re-mount a Probe whose `enabled` flips from true to false on a
			// later render. The hook should refuse to start the new gesture
			// even though the press is on the same target.
			const onRecognize = vi.fn();
			const stateRef: { current: ProbeState } = {
				current: { isActive: false, path: [], recognizedAction: null },
			};
			const Stub = (): ReactElement => {
				const containerRef = useRef<HTMLDivElement | null>(null);
				const gesture = useAnchorGesture<Action>({
					targetRef: containerRef,
					config: { map: GESTURE_MAP },
					onRecognize,
					enabled: false,
				});
				stateRef.current = {
					isActive: gesture.isActive,
					path: gesture.path,
					recognizedAction: gesture.recognizedAction,
				};
				return (
					<div
						ref={containerRef}
						data-testid="enabled-toggle-target"
						style={{ width: 200, height: 200 }}
						onPointerDown={gesture.onPointerDown}
					>
						toggle
					</div>
				);
			};
			render(<Stub />);
			const target = document.querySelector(
				"[data-testid='enabled-toggle-target']",
			) as HTMLDivElement;
			fireEvent.pointerDown(target, {
				button: 0,
				clientX: 30,
				clientY: 30,
				pointerId: 1,
			});
			expect(stateRef.current.isActive).toBe(false);
			expect(onRecognize).not.toHaveBeenCalled();
		});
	});

	describe("cleanup", () => {
		it("removes document listeners when the gesture is released", () => {
			const removeSpy = vi.spyOn(document, "removeEventListener");
			const { target } = renderProbe({ onRecognize: vi.fn() });

			fireEvent.pointerDown(target, {
				button: 0,
				clientX: 30,
				clientY: 30,
				pointerId: 1,
			});
			act(() => {
				fireEvent.pointerUp(document, {
					button: 0,
					clientX: 30,
					clientY: 30,
					pointerId: 1,
				});
			});

			const moveRemoves = removeSpy.mock.calls.filter(
				([evName]) => evName === "pointermove",
			);
			expect(moveRemoves.length).toBeGreaterThanOrEqual(1);
			const upRemoves = removeSpy.mock.calls.filter(
				([evName]) => evName === "pointerup",
			);
			expect(upRemoves.length).toBeGreaterThanOrEqual(1);
		});
	});

	describe("renderHook", () => {
		it("exposes stable default state via the hook", () => {
			const containerRef: RefObject<HTMLDivElement | null> = { current: null };
			const opts: RenderHookOptions<{
				targetRef: RefObject<HTMLDivElement | null>;
				map: Record<string, Action>;
				onRecognize: (a: Action) => void;
			}> = {
				initialProps: {
					targetRef: containerRef,
					map: { right: "right" },
					onRecognize: vi.fn(),
				},
			};
			const { result } = renderHook(
				({ targetRef, map, onRecognize }) =>
					useAnchorGesture<Action>({
						targetRef,
						config: { map },
						onRecognize,
					}),
				opts,
			);
			expect(result.current.isActive).toBe(false);
			expect(result.current.path).toEqual([]);
			expect(result.current.recognizedAction).toBeNull();
			expect(typeof result.current.onPointerDown).toBe("function");
		});
	});
});

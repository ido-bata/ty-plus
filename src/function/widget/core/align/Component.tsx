import {
	type JSX,
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";

import { useWidgetRuntime } from "@/function/widget/runtime-context";
import {
	DRAG_HANDLE_MARGIN,
	RESIZE_MARGIN,
} from "@/management/workspace/events/constants";
import type { AlignTargetId, SurfaceState } from "@/management/workspace/state";
import {
	AlignIcon,
	TargetIcon,
} from "@/management/workspace/surface/widget-grid-icons";
import { useAnchorGesture } from "@/shared/component/interaction/use-anchor-gesture";
import { cx } from "@/shared/util/cx";
import { css } from "@/styled-system/css";

type Action =
	| "align-left"
	| "align-center-h"
	| "align-right"
	| "align-top"
	| "align-center-v"
	| "align-bottom"
	| "distribute-left"
	| "distribute-center-h"
	| "distribute-right"
	| "distribute-top"
	| "distribute-center-v"
	| "distribute-bottom"
	| "distribute-spacing-h"
	| "distribute-spacing-v"
	| "distribute-h"
	| "distribute-v"
	| "align-start"
	| "align-end"
	| "align-duration"
	| "distribute-start"
	| "distribute-end";

const GESTURE_MAP: Record<string, Action> = {
	right: "align-right",
	left: "align-left",
	top: "align-top",
	bottom: "align-bottom",
	"right-left": "align-center-h",
	"left-right": "align-center-h",
	"bottom-top": "align-center-v",
	"top-bottom": "align-center-v",
	"left-top": "distribute-h",
	"left-bottom": "distribute-h",
	"right-top": "distribute-h",
	"right-bottom": "distribute-h",
	"top-left": "distribute-v",
	"top-right": "distribute-v",
	"bottom-left": "distribute-v",
	"bottom-right": "distribute-v",
	"right-right": "distribute-spacing-h",
	"left-left": "distribute-spacing-h",
	"bottom-bottom": "distribute-spacing-v",
	"top-top": "distribute-spacing-v",
};

interface Props {
	state: SurfaceState;
	widthPx: number;
	widgetInstanceId: string;
}

const isDistributeAction = (action: string) => action.startsWith("distribute-");
const isSpacingAction = (action: string) =>
	action.startsWith("distribute-spacing-") ||
	action === "distribute-h" ||
	action === "distribute-v";
const isDisabled = (action: string, selectionCount: number) =>
	selectionCount === 0 ||
	(selectionCount === 1 &&
		(isDistributeAction(action) || isSpacingAction(action)));

const ALIGN_BTN_CLASS = css({
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	backgroundColor: "transparent",
	borderWidth: 0,
	borderRadius: "sm",
	color: "var(--text,#e8e8ec)",
	cursor: "pointer",
	paddingInline: "1",
	paddingBlock: "1.5",
	minHeight: "32px",
	width: "full",
	boxSizing: "border-box",
	transitionProperty: "colors",
	transitionDuration: "100",
	_hover: { backgroundColor: "rgba(255,255,255,0.1)" },
	_active: { backgroundColor: "rgba(255,255,255,0.15)" },
});

const SECTION_LABEL_CLASS = css({
	paddingInline: "2px",
	marginTop: "1.25",
	marginBottom: "0.75",
	fontSize: "9px",
	fontWeight: "medium",
	textTransform: "uppercase",
	letterSpacing: "0.5px",
	lineHeight: "tight",
	color: "text.muted",
	opacity: 0.8,
	_first: { marginTop: 0 },
});

type AlignAction = Action | null;

function AlignButtonGrid({
	actions,
	selectionCount,
	isGestureActive,
	onAction,
}: {
	actions: (AlignAction | null)[];
	selectionCount: number;
	isGestureActive: boolean;
	onAction: (action: Action) => void;
}): JSX.Element {
	return (
		<div
			className={css({
				display: "grid",
				gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
				gap: "0.5",
				flex: 1,
				minWidth: 0,
				width: "full",
				boxSizing: "border-box",
			})}
		>
			{actions.map((action, index) =>
				action ? (
					<button
						key={action}
						type="button"
						className={cx(
							ALIGN_BTN_CLASS,
							isDisabled(action, selectionCount)
								? css({
										opacity: 0.4,
										cursor: "not-allowed",
										pointerEvents: "none",
									})
								: "",
						)}
						title={action}
						disabled={isDisabled(action, selectionCount)}
						onClick={(e) => {
							if (!isGestureActive && !isDisabled(action, selectionCount)) {
								e.stopPropagation();
								onAction(action);
							}
						}}
					>
						<AlignIcon name={action} />
					</button>
				) : (
					<div key={`spacer-${index}`} className={css({ minWidth: 0 })} />
				),
			)}
		</div>
	);
}

function SectionLabel({ children }: { children: string }): JSX.Element {
	return <div className={SECTION_LABEL_CLASS}>{children}</div>;
}

function GestureOverlay({
	isActive,
	path,
}: {
	isActive: boolean;
	path: ReadonlyArray<{ x: number; y: number }>;
}): JSX.Element | null {
	if (!isActive) return null;
	const lastPoint = path[path.length - 1];
	return (
		<svg
			className={css({
				position: "absolute",
				inset: 0,
				pointerEvents: "none",
				zIndex: 100,
				overflow: "visible",
			})}
			aria-label="Gesture path overlay"
		>
			<title>Gesture path overlay</title>
			{path.length > 1 && (
				<polyline
					points={path.map((p) => `${p.x},${p.y}`).join(" ")}
					fill="none"
					stroke="var(--action-primary)"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			)}
			{lastPoint && (
				<circle
					cx={lastPoint.x}
					cy={lastPoint.y}
					r="3"
					fill="var(--action-primary)"
				/>
			)}
		</svg>
	);
}

function TargetSelectorRow({
	target,
	setIsManualTarget,
	setTarget,
}: {
	target: AlignTargetId;
	setIsManualTarget: React.Dispatch<React.SetStateAction<boolean>>;
	setTarget: React.Dispatch<React.SetStateAction<AlignTargetId>>;
}): JSX.Element {
	const pickTarget = (newTarget: AlignTargetId) => () => {
		setIsManualTarget(true);
		setTarget(newTarget);
	};
	const btnClass = (t: AlignTargetId) =>
		cx(
			css({
				flex: 1,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				backgroundColor: "transparent",
				borderWidth: 0,
				borderRadius: "sm",
				color: "text.muted",
				cursor: "pointer",
				paddingInline: "1",
				paddingBlock: "1.5",
				minHeight: "32px",
				transitionProperty: "colors",
				transitionDuration: "100",
				minWidth: 0,
				_hover: {
					backgroundColor: "rgba(255,255,255,0.05)",
					color: "text.primary",
				},
			}),
			target === t
				? css({
						backgroundColor: "rgba(255,255,255,0.1)",
						color: "var(--action-primary,#4facfe)",
					})
				: "",
		);
	return (
		<div
			className={css({
				marginTop: "auto",
				display: "flex",
				gap: "3px",
				paddingTop: "1.5",
				borderTopWidth: "1px",
				borderTopStyle: "solid",
				borderTopColor: "rgba(255,255,255,0.1)",
				width: "full",
			})}
		>
			<button
				type="button"
				className={btnClass("selection")}
				onClick={pickTarget("selection")}
				title="Align to Selection"
			>
				<TargetIcon name="selection" />
			</button>
			<button
				type="button"
				className={btnClass("comp")}
				onClick={pickTarget("comp")}
				title="Align to Composition"
			>
				<TargetIcon name="comp" />
			</button>
			<button
				type="button"
				className={btnClass("key-object")}
				onClick={pickTarget("key-object")}
				title="Align to Key Object"
			>
				<TargetIcon name="key-object" />
			</button>
			<button
				type="button"
				className={btnClass("time")}
				onClick={pickTarget("time")}
				title="Time Alignment"
			>
				<TargetIcon name="time" />
			</button>
		</div>
	);
}

export function Align({
	state,
	widthPx,
	widgetInstanceId,
}: Props): JSX.Element {
	const { activeWidgetInstanceId, host, setActiveWidgetInstanceId } =
		useWidgetRuntime();
	const isActiveWidget = activeWidgetInstanceId === widgetInstanceId;
	const [selectionCount, setSelectionCount] = useState(0);
	const [target, setTarget] = useState<AlignTargetId>("comp");
	const [isManualTarget, setIsManualTarget] = useState(false);

	const widgetRef = useRef<HTMLDivElement>(null);
	const alignSectionRef = useRef<HTMLDivElement>(null);
	const distributeSectionRef = useRef<HTMLDivElement>(null);
	const spacingSectionRef = useRef<HTMLDivElement>(null);
	const targetRowRef = useRef<HTMLDivElement>(null);
	const [size, setSize] = useState(() => ({ w: widthPx, h: 0 }));
	const [sectionHeights, setSectionHeights] = useState(() => ({
		align: 0,
		distribute: 0,
		spacing: 0,
		target: 0,
	}));

	// Use ResizeObserver for accurate local sizing
	useEffect(() => {
		if (!widgetRef.current) return;
		const obs = new ResizeObserver((entries) => {
			for (const entry of entries) {
				if (entry.contentBoxSize && entry.contentBoxSize.length > 0) {
					const { inlineSize, blockSize } = entry.contentBoxSize[0];
					setSize({ w: inlineSize, h: blockSize });
				} else {
					setSize({ w: entry.contentRect.width, h: entry.contentRect.height });
				}
			}
		});
		obs.observe(widgetRef.current);
		return () => obs.disconnect();
	}, []);

	// Measure section heights
	useLayoutEffect(() => {
		const measureSections = () => {
			setSectionHeights({
				align: alignSectionRef.current?.offsetHeight ?? 0,
				distribute: distributeSectionRef.current?.offsetHeight ?? 0,
				spacing: spacingSectionRef.current?.offsetHeight ?? 0,
				target: targetRowRef.current?.offsetHeight ?? 0,
			});
		};
		measureSections();
		const timeoutId = setTimeout(measureSections, 0);
		return () => clearTimeout(timeoutId);
	}, []);

	const showTwoGroups = size.w >= 180;

	const alignHeight = sectionHeights.align || (showTwoGroups ? 60 : 90);
	const distributeHeight =
		sectionHeights.distribute || (showTwoGroups ? 60 : 90);
	const spacingHeight = sectionHeights.spacing || (showTwoGroups ? 60 : 90);
	const targetHeight = sectionHeights.target || 35;
	const sectionGap = 10;
	const buffer = 30;

	const showDistribute =
		size.h >= alignHeight + sectionGap + distributeHeight - buffer;
	const showSpacing =
		size.h >=
		alignHeight +
			sectionGap +
			distributeHeight +
			sectionGap +
			spacingHeight -
			buffer;
	const showTarget =
		size.h >= alignHeight + sectionGap + targetHeight - buffer ||
		(showDistribute &&
			size.h >=
				alignHeight +
					sectionGap +
					distributeHeight +
					sectionGap +
					targetHeight -
					buffer) ||
		(showSpacing &&
			size.h >=
				alignHeight +
					sectionGap +
					distributeHeight +
					sectionGap +
					spacingHeight +
					sectionGap +
					targetHeight -
					buffer);

	// biome-ignore lint/correctness/useExhaustiveDependencies: isActiveWidget triggers re-fetch on activation
	useEffect(() => {
		let cancelled = false;
		const load = async () => {
			const result = await host("getSelectionCount", []);
			if (cancelled) return;
			if (result.value !== undefined && typeof result.value === "object") {
				setSelectionCount((result.value as { count: number }).count);
			}
		};
		void load();
		return () => {
			cancelled = true;
		};
	}, [host, isActiveWidget]);

	const run = useCallback(
		async (action: Action, autoTarget?: AlignTargetId) => {
			setActiveWidgetInstanceId(widgetInstanceId);
			const res = await host("getSelectionCount", []);
			if (res.value !== undefined && typeof res.value === "object") {
				const count = (res.value as { count: number }).count;
				setSelectionCount(count);
				if (!isManualTarget) {
					if (count === 1 && target !== "comp") setTarget("comp");
					else if (count >= 2 && target === "comp") setTarget("selection");
				}
			}
			await host("alignLayers", [{ action, target: autoTarget ?? target }]);
		},
		[host, target, isManualTarget, setActiveWidgetInstanceId, widgetInstanceId],
	);

	const gesture = useAnchorGesture<Action>({
		targetRef: widgetRef,
		config: {
			map: GESTURE_MAP,
			// Restore the legacy alignment guards from
			// `isAlignGestureStart` in `management/workspace/events/handler.ts`
			// so the surrounding tile's resize / move gestures win near the
			// widget root's edges.
			resizeMargin: RESIZE_MARGIN,
			dragHandleMargin: DRAG_HANDLE_MARGIN,
		},
		onRecognize: (action) => {
			setActiveWidgetInstanceId(widgetInstanceId);
			const isDistributeAction = action.startsWith("distribute-");
			const autoTarget: AlignTargetId | undefined = isDistributeAction
				? "selection"
				: undefined;
			void run(action, autoTarget);
		},
	});

	// ── Context menu event listeners ────────────────────────────────────────
	useEffect(() => {
		const onAlignContextCommand = (event: Event): void => {
			const detail = (event as CustomEvent<{ action?: string }>).detail;
			if (!detail?.action) return;
			void run(detail.action as Action);
		};
		const onAlignTargetChanged = (event: Event): void => {
			const detail = (event as CustomEvent<{ target?: string }>).detail;
			if (!detail?.target) return;
			setIsManualTarget(true);
			setTarget(detail.target as AlignTargetId);
		};
		window.addEventListener(
			"ty-plus:align-context-command",
			onAlignContextCommand,
		);
		window.addEventListener(
			"ty-plus:align-target-changed",
			onAlignTargetChanged,
		);
		return () => {
			window.removeEventListener(
				"ty-plus:align-context-command",
				onAlignContextCommand,
			);
			window.removeEventListener(
				"ty-plus:align-target-changed",
				onAlignTargetChanged,
			);
		};
	}, [run]);

	const runAlign = useCallback(
		(action: Action) => {
			void run(action);
		},
		[run],
	);

	return (
		<div
			ref={widgetRef}
			role="application"
			tabIndex={-1}
			className={css({
				position: "relative",
				display: "flex",
				flexDirection: "column",
				width: "full",
				height: "full",
				minHeight: 0,
				minWidth: 0,
				padding: "3px",
				boxSizing: "border-box",
				overflow: "hidden",
				userSelect: "none",
				backgroundColor: "var(--widget-background,rgba(30,30,30,0.8))",
				borderWidth: 0,
				borderRadius: "var(--radius,6px)",
			})}
			onFocusCapture={() => setActiveWidgetInstanceId(widgetInstanceId)}
			onPointerDown={gesture.onPointerDown}
			onContextMenu={(e) => gesture.isActive && e.preventDefault()}
			data-two-groups={showTwoGroups}
		>
			<GestureOverlay isActive={gesture.isActive} path={gesture.path} />

			{/* Align Section */}
			<div ref={alignSectionRef}>
				{(showDistribute || showSpacing) && <SectionLabel>Align</SectionLabel>}
				<div
					className={cx(
						css({
							display: "flex",
							gap: "0.5",
							width: "full",
							boxSizing: "border-box",
						}),
						showTwoGroups
							? css({ flexDirection: "row" })
							: css({ flexDirection: "column" }),
					)}
				>
					<AlignButtonGrid
						actions={["align-left", "align-center-h", "align-right"]}
						selectionCount={selectionCount}
						isGestureActive={gesture.isActive}
						onAction={run}
					/>
					<AlignButtonGrid
						actions={["align-top", "align-center-v", "align-bottom"]}
						selectionCount={selectionCount}
						isGestureActive={gesture.isActive}
						onAction={run}
					/>
				</div>
			</div>

			{/* Distribute Section */}
			{showDistribute && (
				<div ref={distributeSectionRef}>
					<SectionLabel>Distribute</SectionLabel>
					<div
						className={cx(
							css({
								display: "flex",
								gap: "0.5",
								width: "full",
								boxSizing: "border-box",
							}),
							showTwoGroups
								? css({ flexDirection: "row" })
								: css({ flexDirection: "column" }),
						)}
					>
						<AlignButtonGrid
							actions={[
								"distribute-left",
								"distribute-center-h",
								"distribute-right",
							]}
							selectionCount={selectionCount}
							isGestureActive={gesture.isActive}
							onAction={run}
						/>
						<AlignButtonGrid
							actions={[
								"distribute-top",
								"distribute-center-v",
								"distribute-bottom",
							]}
							selectionCount={selectionCount}
							isGestureActive={gesture.isActive}
							onAction={run}
						/>
					</div>
				</div>
			)}

			{/* Spacing Section */}
			{showSpacing && (
				<div ref={spacingSectionRef}>
					<SectionLabel>Spacing</SectionLabel>
					<div
						className={cx(
							css({
								display: "flex",
								gap: "0.5",
								width: "full",
								boxSizing: "border-box",
							}),
							showTwoGroups
								? css({ flexDirection: "row" })
								: css({ flexDirection: "column" }),
						)}
					>
						<AlignButtonGrid
							actions={["distribute-spacing-h", "distribute-h", null]}
							selectionCount={selectionCount}
							isGestureActive={gesture.isActive}
							onAction={run}
						/>
						<AlignButtonGrid
							actions={["distribute-spacing-v", "distribute-v", null]}
							selectionCount={selectionCount}
							isGestureActive={gesture.isActive}
							onAction={run}
						/>
					</div>
				</div>
			)}

			{/* Time Section */}
			{target === "time" && (
				<div>
					<SectionLabel>Time</SectionLabel>
					<div
						className={cx(
							css({
								display: "flex",
								gap: "0.5",
								width: "full",
								boxSizing: "border-box",
							}),
							showTwoGroups
								? css({ flexDirection: "row" })
								: css({ flexDirection: "column" }),
						)}
					>
						<AlignButtonGrid
							actions={["align-start", "align-end", "align-duration"]}
							selectionCount={selectionCount}
							isGestureActive={gesture.isActive}
							onAction={run}
						/>
						<AlignButtonGrid
							actions={["distribute-start", "distribute-end", null]}
							selectionCount={selectionCount}
							isGestureActive={gesture.isActive}
							onAction={run}
						/>
					</div>
				</div>
			)}

			{/* Target Row */}
			{showTarget && (
				<div ref={targetRowRef}>
					<TargetSelectorRow
						target={target}
						setIsManualTarget={setIsManualTarget}
						setTarget={setTarget}
					/>
				</div>
			)}
		</div>
	);
}

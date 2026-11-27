import { Button, cx, useAnchorGesture } from "@ty-plus/ui";
import {
	type JSX,
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { useWidgetRuntime } from "@/function/widget/runtime-context";
import { i18n } from "@/management/i18n/index";
import type {
	AlignTargetId,
	SurfaceState,
} from "@/management/workspace/core/state";
import {
	DRAG_HANDLE_MARGIN,
	RESIZE_MARGIN,
} from "@/management/workspace/events/constants";
import {
	AlignIcon,
	TargetIcon,
} from "@/management/workspace/surface/widget-grid-icons";
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
	position: "relative",
	alignItems: "center",
	justifyContent: "center",
	backgroundColor: "transparent",
	borderWidth: 0,
	borderRadius: "sm",
	color: "text.primary",
	cursor: "pointer",
	paddingInline: "1",
	paddingBlock: "1.5",
	minHeight: "32px",
	width: "full",
	boxSizing: "border-box",
	transitionProperty: "color, background-color, border-color",
	transitionDuration: "100",
	_hover: {
		backgroundColor:
			"rgba(var(--text-r), var(--text-g), var(--text-b), var(--ty-opacity-ws-align-hover))",
	},
	_active: {
		backgroundColor:
			"rgba(var(--text-r), var(--text-g), var(--text-b), var(--ty-opacity-ws-align-active))",
	},
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

/**
 * Full-cell click target overlaid on an align action/target surface. The
 * surface div owns the custom hover/active treatment; this bare Button only
 * provides semantics, the shared focus ring and the disabled treatment.
 */
const alignHitAreaClass = css({
	position: "absolute",
	inset: "0",
	_focusVisible: {
		boxShadow: "var(--color-focus-ring)",
	},
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
					<div
						key={action}
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
					>
						<AlignIcon name={action} />
						<Button
							variant="bare"
							uiSize="content"
							className={alignHitAreaClass}
							title={action}
							disabled={isDisabled(action, selectionCount)}
							data-ws-action={action}
							onClick={(e) => {
								if (!isGestureActive && !isDisabled(action, selectionCount)) {
									e.stopPropagation();
									onAction(action);
								}
							}}
						/>
					</div>
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
				zIndex: "var(--ty-z-gesture)",
				overflow: "visible",
			})}
			aria-label={i18n.t("widgets:align.gestureOverlay")}
		>
			<title>{i18n.t("widgets:align.gestureOverlay")}</title>
			{path.length > 1 && (
				<polyline
					points={path.map((p) => `${p.x},${p.y}`).join(" ")}
					fill="none"
					stroke="var(--color-text-accent)"
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
					fill="var(--color-text-accent)"
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
				position: "relative",
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
				transitionProperty: "color, background-color, border-color",
				transitionDuration: "100",
				minWidth: 0,
				_hover: {
					backgroundColor:
						"rgba(var(--text-r), var(--text-g), var(--text-b), var(--ty-opacity-ws-target-hover))",
					color: "text.primary",
				},
			}),
			target === t
				? css({
						backgroundColor:
							"rgba(var(--text-r), var(--text-g), var(--text-b), var(--ty-opacity-ws-target-active-bg))",
						color: "text.accent",
					})
				: "",
		);
	return (
		<div
			className={css({
				display: "flex",
				gap: "3px",
				paddingTop: "1.5",
				borderTopWidth: "hairline",
				borderTopStyle: "solid",
				borderTopColor: "border.subtle",
				width: "full",
			})}
		>
			<div className={btnClass("selection")}>
				<TargetIcon name="selection" />
				<Button
					variant="bare"
					uiSize="content"
					className={alignHitAreaClass}
					data-ws-action="align-target-selection"
					onClick={pickTarget("selection")}
					title={i18n.t("widgets:align.targets.selection")}
				/>
			</div>
			<div className={btnClass("comp")}>
				<TargetIcon name="comp" />
				<Button
					variant="bare"
					uiSize="content"
					className={alignHitAreaClass}
					data-ws-action="align-target-comp"
					onClick={pickTarget("comp")}
					title={i18n.t("widgets:align.targets.composition")}
				/>
			</div>
			<div className={btnClass("key-object")}>
				<TargetIcon name="key-object" />
				<Button
					variant="bare"
					uiSize="content"
					className={alignHitAreaClass}
					data-ws-action="align-target-key-object"
					onClick={pickTarget("key-object")}
					title={i18n.t("widgets:align.targets.keyObject")}
				/>
			</div>
			<div className={btnClass("time")}>
				<TargetIcon name="time" />
				<Button
					variant="bare"
					uiSize="content"
					className={alignHitAreaClass}
					data-ws-action="align-target-time"
					onClick={pickTarget("time")}
					title={i18n.t("widgets:align.targets.time")}
				/>
			</div>
		</div>
	);
}

export function Align({ widthPx, widgetInstanceId }: Props): JSX.Element {
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
	const timeSectionRef = useRef<HTMLDivElement>(null);
	const targetRowRef = useRef<HTMLDivElement>(null);
	const [size, setSize] = useState(() => ({ w: widthPx, h: 0 }));
	const [sectionHeights, setSectionHeights] = useState(() => ({
		align: 0,
		distribute: 0,
		spacing: 0,
		time: 0,
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

	// Measure section heights. Re-run when the target changes (the Time
	// section mounts/unmounts) and when the width flips the two-group
	// layout, since both change the measured offsets.
	// biome-ignore lint/correctness/useExhaustiveDependencies: target/size.w are re-measure triggers, not effect inputs
	useLayoutEffect(() => {
		const measureSections = () => {
			setSectionHeights({
				align: alignSectionRef.current?.offsetHeight ?? 0,
				distribute: distributeSectionRef.current?.offsetHeight ?? 0,
				spacing: spacingSectionRef.current?.offsetHeight ?? 0,
				time: timeSectionRef.current?.offsetHeight ?? 0,
				target: targetRowRef.current?.offsetHeight ?? 0,
			});
		};
		measureSections();
		const timeoutId = setTimeout(measureSections, 0);
		return () => clearTimeout(timeoutId);
	}, [target, size.w]);

	const showTwoGroups = size.w >= 180;

	const alignHeight = sectionHeights.align || (showTwoGroups ? 60 : 90);
	const distributeHeight =
		sectionHeights.distribute || (showTwoGroups ? 60 : 90);
	const spacingHeight = sectionHeights.spacing || (showTwoGroups ? 60 : 90);
	const timeHeight = sectionHeights.time || (showTwoGroups ? 60 : 90);
	const targetHeight = sectionHeights.target || 35;
	const sectionGap = 10;
	const buffer = 30;
	// The target row is pinned below the clipped sections area and always
	// rendered, so every section budget reserves its height up front.
	// Hiding the row when the Time section consumed the budget left the
	// widget stuck on `target === "time"` with no way back (#670).
	const availableHeight = size.h - targetHeight;

	// The Time section only exists while `target === "time"`. It consumes
	// the same budget as the other optional sections: when it does not
	// fit, the earlier optional sections yield first so the sections
	// area never clips a rendered button row.
	const showTime =
		target === "time" &&
		availableHeight >= alignHeight + sectionGap + timeHeight - buffer;
	const timeBlock = showTime ? timeHeight + sectionGap : 0;

	const showDistribute =
		availableHeight >=
		alignHeight + sectionGap + distributeHeight + timeBlock - buffer;
	const showSpacing =
		availableHeight >=
		alignHeight +
			sectionGap +
			distributeHeight +
			sectionGap +
			spacingHeight +
			timeBlock -
			buffer;

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
			await host("alignLayers", [
				{
					action,
					target: autoTarget ?? target,
					undoGroupName: i18n.t("widgets:align.undoGroupName"),
					messages: {
						noActiveComposition: i18n.t(
							"widgets:align.errors.noActiveComposition",
							{
								defaultValue:
									"Select at least one layer in an active composition",
							},
						),
						noLayerSelected: i18n.t("widgets:align.errors.noLayerSelected", {
							defaultValue: "Select at least one layer before aligning",
						}),
					},
				},
			]);
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

	const _runAlign = useCallback(
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
				backgroundColor: "surface.widget",
				borderWidth: 0,
				borderRadius: "shell-lg",
			})}
			onFocusCapture={() => setActiveWidgetInstanceId(widgetInstanceId)}
			onPointerDown={gesture.onPointerDown}
			onContextMenu={(e) => gesture.isActive && e.preventDefault()}
			data-two-groups={showTwoGroups}
		>
			<GestureOverlay isActive={gesture.isActive} path={gesture.path} />

			{/* Sections — clipped here so the pinned target row below never
			    loses its place when the Time section consumes the budget. */}
			<div
				className={css({
					flex: 1,
					minHeight: 0,
					overflow: "hidden",
					display: "flex",
					flexDirection: "column",
				})}
			>
				{/* Align Section */}
				<div ref={alignSectionRef}>
					{(showDistribute || showSpacing) && (
						<SectionLabel>{i18n.t("widgets:align.name")}</SectionLabel>
					)}
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
						<SectionLabel>
							{i18n.t("widgets:align.sections.distribute")}
						</SectionLabel>
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
						<SectionLabel>
							{i18n.t("widgets:align.sections.spacing")}
						</SectionLabel>
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
				{showTime && (
					<div ref={timeSectionRef} data-ws-align-section="time">
						<SectionLabel>{i18n.t("widgets:align.sections.time")}</SectionLabel>
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
			</div>

			{/* Target Row — always rendered and pinned so the user can
			    always switch back from `target === "time"` (#670). */}
			<div ref={targetRowRef} className={css({ flexShrink: 0 })}>
				<TargetSelectorRow
					target={target}
					setIsManualTarget={setIsManualTarget}
					setTarget={setTarget}
				/>
			</div>
		</div>
	);
}

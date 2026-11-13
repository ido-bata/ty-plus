import React, { type JSX } from "react";
import type { WidgetRenderProps } from "@/function/widget/define";
import {
	type GesturePoint,
	useAnchorGesture,
} from "@/shared/component/interaction/use-anchor-gesture";
import { css } from "@/styled-system/css";
import {
	type AnchorPosition,
	isValidAnchorPosition,
	runAnchorScript,
} from "./index";

const ANCHOR_POSITIONS: readonly (readonly [AnchorPosition, string, string])[] =
	[
		["top-left", "12%", "12%"],
		["top-center", "50%", "12%"],
		["top-right", "88%", "12%"],
		["center-left", "12%", "50%"],
		["center", "50%", "50%"],
		["center-right", "88%", "50%"],
		["bottom-left", "12%", "88%"],
		["bottom-center", "50%", "88%"],
		["bottom-right", "88%", "88%"],
	];

/**
 * Stroke → anchor map for `useAnchorGesture`.
 *
 * Cardinally snapped drags land on edge anchors; L-shape diagonals land on
 * corner anchors; L-shape horizontal/vertical sweeps over the origin land on
 * the center anchor. See `docs/architecture/widget/anchor-point.md`.
 */
const ANCHOR_GESTURE_MAP: Readonly<Record<string, AnchorPosition>> = {
	left: "center-left",
	right: "center-right",
	top: "top-center",
	bottom: "bottom-center",
	"left-right": "center",
	"right-left": "center",
	"top-bottom": "center",
	"bottom-top": "center",
	"left-top": "top-left",
	"right-top": "top-right",
	"left-bottom": "bottom-left",
	"right-bottom": "bottom-right",
	"top-left": "top-left",
	"top-right": "top-right",
	"bottom-left": "bottom-left",
	"bottom-right": "bottom-right",
	"left-left": "center-left",
	"right-right": "center-right",
	"top-top": "top-center",
	"bottom-bottom": "bottom-center",
};

const ANCHOR_LABELS: Readonly<Record<string, string>> = {
	"top-left": "Top Left",
	"top-center": "Top Center",
	"top-right": "Top Right",
	"center-left": "Center Left",
	center: "Center",
	"center-right": "Center Right",
	"bottom-left": "Bottom Left",
	"bottom-center": "Bottom Center",
	"bottom-right": "Bottom Right",
};

function AnchorPointGestureOverlay({
	isActive,
	path,
	recognizedAction,
}: {
	isActive: boolean;
	path: ReadonlyArray<GesturePoint>;
	recognizedAction: string | null;
}): JSX.Element | null {
	if (!isActive) return null;
	const points = path.map((p) => `${p.x},${p.y}`).join(" ");
	const label =
		recognizedAction !== null
			? (ANCHOR_LABELS[recognizedAction] ?? null)
			: null;
	return (
		<svg
			className={css({
				pointerEvents: "none",
				position: "absolute",
				inset: 0,
				zIndex: 10,
				height: "full",
				width: "full",
				overflow: "visible",
			})}
			aria-label="Anchor point gesture overlay"
		>
			<title>Anchor point gesture overlay</title>
			{points.length > 0 && (
				<polyline
					points={points}
					fill="none"
					stroke="var(--action-primary)"
					strokeWidth={2}
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			)}
			{path.length > 0 && (
				<circle
					cx={path[path.length - 1]?.x ?? 0}
					cy={path[path.length - 1]?.y ?? 0}
					r={3}
					fill="var(--action-primary)"
				/>
			)}
			{label !== null && (
				<text
					x={4}
					y={14}
					className={css({ fill: "var(--accent, var(--action-primary))" })}
					fontSize={11}
					fontWeight="bold"
					style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.5)" }}
				>
					{label}
				</text>
			)}
		</svg>
	);
}

export function AnchorPointWidget({
	layout,
	widgetInstanceId,
}: WidgetRenderProps): JSX.Element {
	const [currentAnchor, setCurrentAnchor] = React.useState<string>("center");

	React.useEffect(() => {
		const handler = (ev: Event): void => {
			const e = ev as CustomEvent<{ id: string }>;
			const id = e.detail?.id ?? "";
			if (id.startsWith("anchor-point:")) {
				const pos = id.slice("anchor-point:".length);
				if (isValidAnchorPosition(pos)) {
					setCurrentAnchor(pos);
					runAnchorScript(pos);
				}
			} else if (
				id === "ty.ctx.anchor-point.reset-center" ||
				id === "ty.ctx.anchor-point.apply-all-layers" ||
				id === "ty.ctx.anchor-point.apply-active-comp"
			) {
				setCurrentAnchor("center");
				runAnchorScript("center");
			}
		};
		window.addEventListener("ty-plus:anchor-point-context-menu", handler);
		return () =>
			window.removeEventListener("ty-plus:anchor-point-context-menu", handler);
	}, []);

	const widgetRef = React.useRef<HTMLDivElement | null>(null);

	const recognizeAnchor = React.useCallback((pos: AnchorPosition): void => {
		setCurrentAnchor(pos);
		runAnchorScript(pos);
	}, []);

	const gesture = useAnchorGesture<AnchorPosition>({
		targetRef: widgetRef,
		config: { map: ANCHOR_GESTURE_MAP },
		onRecognize: recognizeAnchor,
	});

	return (
		<div
			ref={widgetRef}
			className={css({
				position: "relative",
				display: "flex",
				height: "full",
				width: "full",
				alignItems: "center",
				justifyContent: "center",
				padding: 0,
			})}
			onPointerDown={gesture.onPointerDown}
		>
			<div
				className={css({
					display: "grid",
					height: "94%",
					width: "94%",
					aspectRatio: "1",
					gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
					gridTemplateRows: "repeat(3, minmax(0, 1fr))",
					gap: 0,
					borderRadius: "var(--ty-space-1)",
					padding: "3.5%",
				})}
			>
				{ANCHOR_POSITIONS.map(([pos, xPct, yPct]) => {
					const isSelected = pos === currentAnchor;
					return (
						<button
							key={pos}
							type="button"
							data-ws-action="anchor-point"
							data-anchor={pos}
							title={pos}
							onClick={(e) => {
								if (gesture.isActive) {
									e.stopPropagation();
									return;
								}
								e.stopPropagation();
								setCurrentAnchor(pos);
								runAnchorScript(pos);
							}}
							className={css({
								position: "relative",
								cursor: "pointer",
								backgroundColor: "transparent",
								padding: 0,
								transitionProperty: "colors",
								transitionDuration: "150",
								_hover: {
									backgroundColor:
										"rgba(var(--text-r),var(--text-g),var(--text-b),0.03)",
								},
								_active: {
									backgroundColor:
										"rgba(var(--text-r),var(--text-g),var(--text-b),0.06)",
								},
							})}
						>
							<span className={css({ position: "absolute", inset: "10%" })}>
								{/* Horizontal line */}
								<span
									className={css({
										position: "absolute",
										left: 0,
										right: 0,
										display: "block",
										height: "2px",
										width: "full",
										backgroundColor: isSelected
											? "rgba(var(--accent-r),var(--accent-g),var(--accent-b),0.9)"
											: "rgba(var(--text-r),var(--text-g),var(--text-b),0.35)",
									})}
									style={{ top: yPct }}
								/>
								{/* Vertical line */}
								<span
									className={css({
										position: "absolute",
										top: 0,
										bottom: 0,
										display: "block",
										height: "full",
										width: "2px",
										backgroundColor: isSelected
											? "rgba(var(--accent-r),var(--accent-g),var(--accent-b),0.9)"
											: "rgba(var(--text-r),var(--text-g),var(--text-b),0.35)",
									})}
									style={{ left: xPct }}
								/>
							</span>
						</button>
					);
				})}
			</div>
			<AnchorPointGestureOverlay
				isActive={gesture.isActive}
				path={gesture.path}
				recognizedAction={gesture.recognizedAction}
			/>
		</div>
	);
}

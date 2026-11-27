import { Button, cx, type GesturePoint, useAnchorGesture } from "@ty-plus/ui";
import React, { type JSX } from "react";
import type { WidgetRenderProps } from "@/function/widget/define";
import { i18n } from "@/management/i18n/index";
import { css } from "@/styled-system/css";
import { runAnchorScript } from "./run";
import { type AnchorPosition, isValidAnchorPosition } from "./script";

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
	"top-left": "widgets:anchorPoint.positions.topLeft",
	"top-center": "widgets:anchorPoint.positions.topCenter",
	"top-right": "widgets:anchorPoint.positions.topRight",
	"center-left": "widgets:anchorPoint.positions.centerLeft",
	center: "widgets:anchorPoint.positions.center",
	"center-right": "widgets:anchorPoint.positions.centerRight",
	"bottom-left": "widgets:anchorPoint.positions.bottomLeft",
	"bottom-center": "widgets:anchorPoint.positions.bottomCenter",
	"bottom-right": "widgets:anchorPoint.positions.bottomRight",
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
	const labelKey =
		recognizedAction !== null ? ANCHOR_LABELS[recognizedAction] : undefined;
	const label = labelKey !== undefined ? i18n.t(labelKey) : null;
	return (
		<svg
			className={css({
				pointerEvents: "none",
				position: "absolute",
				inset: 0,
				zIndex: "var(--ty-z-overlay)",
				height: "full",
				width: "full",
				overflow: "visible",
			})}
			aria-label={i18n.t("widgets:anchorPoint.gestureOverlay")}
		>
			<title>{i18n.t("widgets:anchorPoint.gestureOverlay")}</title>
			{points.length > 0 && (
				<polyline
					points={points}
					fill="none"
					stroke="var(--color-text-accent)"
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
					fill="var(--color-text-accent)"
				/>
			)}
			{label !== null && (
				<text
					x={4}
					y={14}
					className={css({ fill: "var(--accent, var(--color-text-accent))" })}
					fontSize={11}
					fontWeight="bold"
					style={{
						paintOrder: "stroke",
						stroke: "var(--color-ty-shadow-50)",
					}}
				>
					{label}
				</text>
			)}
		</svg>
	);
}

/**
 * Full-cell click target overlaid on an anchor-point grid cell. The cell div
 * owns the hover/active fill and the crosshair; this bare Button only
 * provides semantics, the shared focus ring and the disabled treatment.
 */
const anchorHitAreaClass = css({
	position: "absolute",
	inset: "0",
	_focusVisible: {
		boxShadow: "var(--color-focus-ring)",
	},
});

/**
 * Grid cell surface: owns the hover/active fill. The literal `group` class
 * (added at the call site via `cx`) arms Panda's `_groupHover` descendant
 * rules so hovering the cell — or the hit-area Button covering it —
 * brightens the crosshair lines, matching the legacy
 * `.widget-anchor-point-btn:hover::before` contract.
 */
const anchorCellClass = css({
	position: "relative",
	cursor: "pointer",
	padding: 0,
	transitionProperty: "background-color",
	transitionDuration: "150ms",
	_hover: {
		backgroundColor:
			"rgba(var(--text-r),var(--text-g),var(--text-b),var(--ty-opacity-ws-anchor-hover))",
	},
	_active: {
		backgroundColor:
			"rgba(var(--text-r),var(--text-g),var(--text-b),var(--ty-opacity-ws-anchor-active))",
	},
});

const anchorLineHorizontal = css({
	position: "absolute",
	left: 0,
	right: 0,
	display: "block",
	height: "2px",
	width: "full",
});

const anchorLineVertical = css({
	position: "absolute",
	top: 0,
	bottom: 0,
	display: "block",
	height: "full",
	width: "2px",
});

/*
 * Crosshair line treatment (Issue #724). Colours ride the dedicated
 * `ty-opacity-ws-anchor-*` channel tokens — the same alphas the legacy
 * `anchor-point-widget.scss` hardcoded — and `_groupHover` restores the
 * legacy hover brightening the React port dropped: idle lines step
 * 0.35 → 0.75 on hover, while the selected accent line steps to full
 * opacity (the legacy `--color-accent-hover` step). `borderRadius: full`
 * restores the rounded line caps the legacy `border-radius: 3px` produced
 * on the 2px strokes, and the transition restores the legacy
 * `transition: background 0.15s` fade (the old `transitionProperty:
 * "colors"` value was not a real CSS property and never animated).
 */
const anchorLinePaint = css({
	borderRadius: "full",
	transitionProperty: "background-color",
	transitionDuration: "150ms",
});

const anchorLineIdle = css({
	backgroundColor:
		"rgba(var(--text-r),var(--text-g),var(--text-b),var(--ty-opacity-ws-anchor-grid-line))",
	_groupHover: {
		backgroundColor:
			"rgba(var(--text-r),var(--text-g),var(--text-b),var(--ty-opacity-ws-anchor-grid-line-hover))",
	},
});

const anchorLineSelected = css({
	backgroundColor:
		"rgba(var(--accent-r),var(--accent-g),var(--accent-b),var(--ty-opacity-ws-anchor-center-line))",
	_groupHover: {
		backgroundColor:
			"rgba(var(--accent-r),var(--accent-g),var(--accent-b),var(--ty-opacity-action-primary))",
	},
});

export function AnchorPointWidget(_props: WidgetRenderProps): JSX.Element {
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
						<div key={pos} className={cx("group", anchorCellClass)}>
							<span className={css({ position: "absolute", inset: "10%" })}>
								{/* Horizontal line */}
								<span
									className={cx(
										anchorLineHorizontal,
										anchorLinePaint,
										isSelected ? anchorLineSelected : anchorLineIdle,
									)}
									style={{ top: yPct }}
								/>
								{/* Vertical line */}
								<span
									className={cx(
										anchorLineVertical,
										anchorLinePaint,
										isSelected ? anchorLineSelected : anchorLineIdle,
									)}
									style={{ left: xPct }}
								/>
							</span>
							<Button
								variant="bare"
								uiSize="content"
								className={anchorHitAreaClass}
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
							/>
						</div>
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

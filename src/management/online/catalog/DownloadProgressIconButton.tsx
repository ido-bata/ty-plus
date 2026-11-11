import { AlertCircle, Check, Download } from "lucide-react";
import { type ReactElement, useEffect, useRef } from "react";

import { IconButton } from "@/shared/component/controls/IconButton";
import { Icon } from "@/shared/component/icons/Icon";
import { cx } from "@/shared/util/cx";
import { css } from "@/styled-system/css";

import {
	formatStageLabel,
	ringDashOffset,
	stageToProgress,
} from "./download-progress";
import type { DownloadProgress } from "./use-cases";

type DownloadStage = DownloadProgress["stage"];

const RING_RADIUS = 10;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const wrapperBaseClass = css({
	position: "relative",
});

const svgOverlayClass = css({
	position: "absolute",
	inset: 0,
	width: "full",
	height: "full",
});

const iconLayerClass = css({
	position: "relative",
	zIndex: 10,
	display: "inline-flex",
	alignItems: "center",
	justifyContent: "center",
});

// Easing per tick: the displayed percent moves 20% of the remaining
// distance toward the target on every tick. With a 16ms tick that
// settles in ~10 ticks (~160ms) — fast enough to feel responsive,
// slow enough to read as a fill.
const RING_EASE = 0.2;
const TICK_MS = 16;

export type DownloadProgressIconButtonProps = {
	stage?: DownloadStage;
	bytesLoaded?: number;
	bytesTotal?: number;
	isComplete?: boolean;
	isError?: boolean;
	isDownloaded?: boolean;
	iconSize: number;
	className?: string;
	onClick: () => void;
};

/**
 * Icon button whose progress signal IS the ring around the icon — the
 * inner glyph stays static (Download / Check / AlertCircle) so the user
 * reads the ring as "progress", not as another generic loader spinner.
 *
 * The ring is animated by mutating the SVG's `stroke-dashoffset`
 * attribute directly from a `setInterval` tick. We deliberately do
 * NOT go through React state for the per-frame motion. Two reasons:
 *
 *   1. React 18's concurrent renderer can defer state updates coming
 *      from non-React contexts (rAF callbacks, setTimeout, setInterval)
 *      until the current "settle point" is reached. With a single-chunk
 *      download the progress events arrive in one batch; React renders
 *      once at the final value, and any animation built on setState
 *      shows nothing because the intermediate values are skipped.
 *   2. Adobe CEP's embedded Chromium can throttle `requestAnimationFrame`
 *      to 1Hz when the panel is not the focused window (which is
 *      common — clicking on the After Effects main window takes focus
 *      away from the panel). `setInterval` keeps running at the
 *      requested rate regardless of focus.
 *
 * Bypassing React for the per-frame motion guarantees the user always
 * sees a smooth fill, frame by frame.
 */
export function DownloadProgressIconButton(
	props: DownloadProgressIconButtonProps,
): ReactElement {
	const {
		stage,
		bytesLoaded,
		bytesTotal,
		isComplete,
		isError,
		isDownloaded,
		iconSize,
		className,
		onClick,
	} = props;

	const isActive = stage !== undefined;
	const targetPercent = isActive
		? stageToProgress(stage, bytesLoaded, bytesTotal)
		: 0;

	const circleRef = useRef<SVGCircleElement>(null);
	const displayedRef = useRef(0);
	const targetRef = useRef(0);

	// Mirror the prop into a ref so the tick always reads the latest
	// target without re-creating the animation effect.
	useEffect(() => {
		targetRef.current = targetPercent;
	}, [targetPercent]);

	// Reset the displayed value to 0 (full dashoffset, empty ring) on
	// the transition from inactive → active. The tick below then
	// interpolates from 0 toward the target.
	useEffect(() => {
		if (isActive) {
			displayedRef.current = 0;
			if (circleRef.current) {
				circleRef.current.setAttribute(
					"stroke-dashoffset",
					String(RING_CIRCUMFERENCE),
				);
			}
		}
	}, [isActive]);

	// Drive the ring from a setInterval tick. We mutate the SVG
	// attribute directly via `setAttribute` (bypassing React's render
	// cycle) so the user sees smooth motion regardless of how the
	// streaming events arrive or how React's renderer batches.
	useEffect(() => {
		if (!isActive) return;
		const interval = setInterval(() => {
			const target = targetRef.current;
			const current = displayedRef.current;
			const diff = target - current;
			let next: number;
			if (Math.abs(diff) < 0.5) {
				next = target;
			} else {
				next = current + diff * RING_EASE;
				if ((diff > 0 && next > target) || (diff < 0 && next < target)) {
					next = target;
				}
			}
			displayedRef.current = next;
			if (circleRef.current) {
				circleRef.current.setAttribute(
					"stroke-dashoffset",
					String(ringDashOffset(next, RING_RADIUS)),
				);
			}
		}, TICK_MS);
		return () => clearInterval(interval);
	}, [isActive]);

	// Title is a best-effort snapshot at render time. The visible ring is
	// the primary progress signal; the tooltip is for hover detail, and
	// `targetPercent` (derived from props) is the latest-known target
	// without forcing a render tick on the per-frame animated ref.
	const title = isActive
		? formatStageLabel(stage, Math.round(targetPercent))
		: isDownloaded
			? "Already downloaded"
			: "Download";

	const disabled = isDownloaded || isComplete;
	const innerIcon = isError ? (
		<Icon icon={AlertCircle} size={iconSize} />
	) : isComplete || isDownloaded ? (
		<Icon icon={Check} size={iconSize} />
	) : (
		<Icon icon={Download} size={iconSize} />
	);

	return (
		<IconButton
			size="sm"
			variant="ghost"
			title={title}
			onClick={onClick}
			disabled={disabled}
			className={cx(wrapperBaseClass, className ?? "")}
		>
			{isActive ? (
				<svg className={svgOverlayClass} viewBox="0 0 24 24" aria-hidden>
					<title>{title}</title>
					<g transform="rotate(-90 12 12)">
						<circle
							cx="12"
							cy="12"
							r={RING_RADIUS}
							fill="none"
							stroke="var(--color-border-default)"
							strokeWidth="2"
							opacity="0.35"
						/>
						<circle
							cx="12"
							cy="12"
							r={RING_RADIUS}
							fill="none"
							stroke="var(--color-text-accent)"
							strokeWidth="2"
							strokeLinecap="round"
							strokeDasharray={RING_CIRCUMFERENCE}
							ref={circleRef}
						/>
					</g>
				</svg>
			) : null}
			<span className={iconLayerClass}>{innerIcon}</span>
		</IconButton>
	);
}

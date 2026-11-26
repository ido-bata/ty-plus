import type { JSX } from "react";
import { useRef } from "react";
import {
	glyphFrameRadiusPx,
	useFrameMetrics,
} from "@/management/preset/frame-fit";
import { CanvasEasingIcon } from "@/management/preset/workspace/CanvasEasingIcon";
import { css } from "@/styled-system/css";
import { type CanvasVisual, glyphBackgroundStyle } from "./visual";

const wsPresetCanvasShellClass = css({
	boxSizing: "border-box",
	display: "flex",
	height: "full",
	minHeight: "0",
	width: "full",
	minWidth: "0",
	cursor: "pointer",
	alignItems: "center",
	justifyContent: "center",
	overflow: "hidden",
	borderRadius: "shell-sm",
	padding: "1",
});

export function CanvasGlyph({ visual }: { visual: CanvasVisual }): JSX.Element {
	const shellRef = useRef<HTMLSpanElement>(null);
	const metrics = useFrameMetrics(shellRef);
	const [_x1, _y1, _x2, _y2] = visual.cubic;
	return (
		<span
			ref={shellRef}
			className={`ws-preset-icon ws-preset-icon--canvas ${wsPresetCanvasShellClass}`}
			style={{
				...glyphBackgroundStyle(visual.backgroundColor),
				...(metrics
					? { borderRadius: `${glyphFrameRadiusPx(metrics.boxWidth)}px` }
					: {}),
			}}
			aria-hidden="true"
		>
			<CanvasEasingIcon
				cubic={visual.cubic}
				color={visual.color ?? "currentColor"}
			/>
		</span>
	);
}

import type { CSSProperties, JSX } from "react";
import { useRef } from "react";
import {
	glyphFrameRadiusPx,
	useFrameMetrics,
} from "@/management/preset/frame-fit";
import { css } from "@/styled-system/css";
import { type EmojiVisual, glyphBackgroundStyle } from "./visual";

const wsPresetEmojiShellClass = css({
	boxSizing: "border-box",
	display: "flex",
	aspectRatio: "square",
	height: "full",
	minHeight: "0",
	width: "full",
	minWidth: "0",
	cursor: "pointer",
	alignItems: "center",
	justifyContent: "center",
	overflow: "hidden",
	// Fallback radius; the measured `min(12px, 15% of frame width)` px
	// value is applied inline once the frame size is known (#700).
	borderRadius: "shell-sm",
	padding: "0.5px",
});

const wsEmojiInnerClass = css({
	display: "flex",
	width: "full",
	height: "full",
	alignItems: "center",
	justifyContent: "center",
	textAlign: "center",
	fontSize: "var(--ws-glyph-emoji-font-px, 4px)",
});

export function EmojiGlyph({ visual }: { visual: EmojiVisual }): JSX.Element {
	const shellRef = useRef<HTMLSpanElement>(null);
	const metrics = useFrameMetrics(shellRef);
	// Old `clamp(4px, 100cqi, 96px)`: the emoji fills the frame's inline
	// size. CEF 99 has no container units, so the shell's own border-box
	// width — the same reference `cqi` resolved against — drives the size.
	const fontPx = metrics ? Math.min(96, Math.max(4, metrics.boxWidth)) : null;
	return (
		<span
			ref={shellRef}
			data-ws-preset-text-fit="scale"
			className={`ws-preset-icon ws-preset-icon--emoji ${wsPresetEmojiShellClass}`}
			style={
				{
					...glyphBackgroundStyle(visual.backgroundColor),
					"--ws-glyph-emoji-font-px": fontPx === null ? "4px" : `${fontPx}px`,
					...(metrics
						? { borderRadius: `${glyphFrameRadiusPx(metrics.boxWidth)}px` }
						: {}),
				} as CSSProperties
			}
			aria-hidden="true"
		>
			<span className={wsEmojiInnerClass}>{visual.value}</span>
		</span>
	);
}

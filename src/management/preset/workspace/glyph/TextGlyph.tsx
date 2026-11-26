import { cx } from "@ty-plus/ui";
import { type CSSProperties, type JSX, useMemo, useRef } from "react";
import {
	glyphFrameRadiusPx,
	type TextFitSpec,
	useFittedTextFontPx,
	useFrameMetrics,
} from "@/management/preset/frame-fit";
import { css } from "@/styled-system/css";
import { glyphBackgroundStyle, type TextVisual } from "./visual";

const wsPresetTextShellClass = css({
	boxSizing: "border-box",
	display: "flex",
	height: "full",
	minHeight: "0",
	width: "full",
	minWidth: "0",
	cursor: "pointer",
	flexDirection: "column",
	alignItems: "center",
	justifyContent: "center",
	overflow: "hidden",
	// Fallback radius; the measured `min(12px, 15% of frame width)` px
	// value is applied inline once the frame size is known (#700).
	borderRadius: "shell-sm",
	padding: "0.5px",
	fontWeight: "medium",
});

const wsPresetTextLineClass = css({
	display: "inline-block",
	maxWidth: "full",
	minWidth: "0",
	cursor: "pointer",
	whiteSpace: "nowrap",
	textAlign: "center",
	lineHeight: "none",
	fontSize: "var(--ws-glyph-text-font-px, 8px)",
});

const textInheritClass = css({ color: "inherit" });
const textPrimaryClass = css({ color: "text.primary" });

export function TextGlyph({ visual }: { visual: TextVisual }): JSX.Element {
	const raw = visual.value || "?";
	const fit = useMemo<TextFitSpec>(() => {
		const graphemes = Array.from(raw);
		const ch = Math.max(1, graphemes.length);

		// Issue #673: kind badges (FFX / SCRIPT / PLUGIN / MEDIA / …)
		// are single words — the previous ~sqrt(n) split wrapped them
		// mid-word ("PLUGIN" → "PLU"/"GIN", "FFX" → "FF"/"X") and made the
		// badge unreadable. Badge-length text (the editor caps icon text
		// at PRESET_ICON_TEXT_MAX = 6 graphemes) now stays on one line and
		// shrinks via the fitted font size instead of wrapping. Longer
		// legacy strings keep the packed multi-line layout because a
		// single line cannot fit inside the frame.
		const badgeLength = ch <= 6;

		// Multi-line (long strings only): break into lines of ~sqrt(n)
		// graphemes so boxes stay roughly square.
		const charsPerLine = badgeLength ? ch : Math.ceil(Math.sqrt(ch));
		const lines: string[] = [];
		for (let i = 0; i < graphemes.length; i += charsPerLine) {
			lines.push(graphemes.slice(i, i + charsPerLine).join(""));
		}

		// `preferredPct` is the preferred size as a percentage of the
		// frame's inline size — the same proportion the old `NNcqi`
		// font-size declarations expressed. Minimum floors preserve
		// legibility: 8px keeps single-line marks readable inside the
		// ~28px list-row frame (the previous 4px floor rendered
		// dot-sized glyphs), and five- and six-grapheme badges
		// (PLUGIN / SCRIPT / IMPORT / PRESET) cannot hold 8px on one
		// line inside that frame, so their floor drops to 5px — still
		// above the dot-collapse range.
		const preferredPct = lines.length >= 3 ? 10 : lines.length >= 2 ? 13 : 18;
		const minFontPx = badgeLength && ch > 4 ? 5 : 8;
		return { lines, preferredPct, minFontPx };
	}, [raw]);

	const shellRef = useRef<HTMLSpanElement>(null);
	const metrics = useFrameMetrics(shellRef);
	const fontPx = useFittedTextFontPx(shellRef, metrics, fit);

	const textStyle = {
		...glyphBackgroundStyle(visual.backgroundColor),
		...(visual.color ? { color: visual.color } : {}),
		"--ws-glyph-text-font-px": `${fontPx ?? fit.minFontPx}px`,
		...(metrics
			? { borderRadius: `${glyphFrameRadiusPx(metrics.boxWidth)}px` }
			: {}),
	} as CSSProperties;

	return (
		<span
			ref={shellRef}
			data-ws-preset-text-fit="scale"
			className={cx(
				`ws-preset-icon ws-preset-icon--text ${wsPresetTextShellClass}`,
				visual.color ? "" : textPrimaryClass,
			)}
			style={textStyle}
			aria-hidden="true"
		>
			{fit.lines.map((line) => (
				<span
					key={line}
					className={cx(
						wsPresetTextLineClass,
						visual.color ? textInheritClass : textPrimaryClass,
					)}
				>
					{line}
				</span>
			))}
		</span>
	);
}

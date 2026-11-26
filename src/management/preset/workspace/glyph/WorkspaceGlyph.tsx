import { cx } from "@ty-plus/ui";
import {
	type CSSProperties,
	type HTMLAttributes,
	type JSX,
	type ReactNode,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type { PresetIconVisual } from "@/management/preset/assets/icons";
import { resolveWorkspaceGlyphIconVisual } from "@/management/preset/assets/icons";
import type { Preset } from "@/management/preset/contract";
import {
	fitTextFontPx,
	glyphFrameRadiusPx,
	useFrameMetrics,
} from "@/management/preset/frame-fit";
import { CanvasEasingIcon } from "@/management/preset/workspace/CanvasEasingIcon";
import { GlyphCachedImage } from "@/management/preset/workspace/glyph/CachedImage";
import {
	DEFAULT_EMOJI_CLASS,
	frameBase,
	framedTextClass,
} from "@/management/preset/workspace/glyph/classes";
import { css } from "@/styled-system/css";

/** Same host as the workspace `PresetTile` (the source of truth for the in-grid-cell appearance). */
const presetCatalogGlyphHostBase = css({
	display: "flex",
	height: "full",
	minHeight: "0",
	width: "full",
	minWidth: "0",
	alignItems: "center",
	justifyContent: "center",
	padding: "0.5",
	"& [data-ws-preset-icon='image']": {
		display: "flex",
		height: "full",
		minHeight: "0",
		width: "full",
		minWidth: "0",
		overflow: "hidden",
	},
	"& [data-ws-preset-icon='image'] img": {
		height: "full",
		width: "full",
		minHeight: "0",
		minWidth: "0",
		objectFit: "cover",
		objectPosition: "center",
	},
	"& [data-ws-preset-text]:not([data-ws-preset-text-fit])": {
		fontSize: "2xs",
	},
});

export type PresetCatalogGlyphHostProps = HTMLAttributes<HTMLDivElement> & {
	children: ReactNode;
	/** Additional sizing and padding (e.g. `h-7 w-7`). */
	className?: string;
	emojiClass?: string;
	title?: string;
	"aria-busy"?: boolean;
	"aria-label"?: string;
};

/**
 * Same wrapper as the workspace catalog tile. `PresetTile` only swaps in
 * this host.
 */
export function PresetCatalogGlyphHost(
	props: PresetCatalogGlyphHostProps,
): JSX.Element {
	const {
		children,
		className,
		emojiClass = DEFAULT_EMOJI_CLASS,
		title,
		"aria-busy": ariaBusy,
		"aria-label": ariaLabel,
		...divProps
	} = props;
	return (
		<div
			{...divProps}
			className={cx(presetCatalogGlyphHostBase, emojiClass, className)}
			title={title}
			aria-busy={ariaBusy}
			aria-label={ariaLabel}
		>
			{children}
		</div>
	);
}

export type FramedPresetGlyphProps = {
	preset: Preset;
	boxClass: string;
	emojiClass?: string;
	className?: string;
};

/**
 * Framed preset icon (no `getPreset` lookup). Use when the caller already
 * has a `Preset` in hand.
 */
export function FramedPresetGlyph(props: FramedPresetGlyphProps): JSX.Element {
	const {
		preset,
		boxClass,
		emojiClass = DEFAULT_EMOJI_CLASS,
		className,
	} = props;
	return (
		<div
			className={cx(
				frameBase,
				framedTextClass,
				emojiClass,
				boxClass,
				className,
			)}
		>
			<WorkspacePresetGlyph preset={preset} />
		</div>
	);
}

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

type EmojiVisual = Extract<PresetIconVisual, { kind: "emoji" }>;
type CanvasVisual = Extract<PresetIconVisual, { kind: "canvas" }>;
type TextVisual = Extract<PresetIconVisual, { kind: "text" }>;

function backgroundStyle(
	backgroundColor: string | undefined,
): CSSProperties | undefined {
	return backgroundColor ? { backgroundColor } : undefined;
}

function EmojiGlyph({ visual }: { visual: EmojiVisual }): JSX.Element {
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
					...backgroundStyle(visual.backgroundColor),
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

function CanvasGlyph({ visual }: { visual: CanvasVisual }): JSX.Element {
	const shellRef = useRef<HTMLSpanElement>(null);
	const metrics = useFrameMetrics(shellRef);
	const [_x1, _y1, _x2, _y2] = visual.cubic;
	return (
		<span
			ref={shellRef}
			className={`ws-preset-icon ws-preset-icon--canvas ${wsPresetCanvasShellClass}`}
			style={{
				...backgroundStyle(visual.backgroundColor),
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

type TextFit = {
	lines: string[];
	lineScale: number;
	minFontPx: number;
};

function TextGlyph({ visual }: { visual: TextVisual }): JSX.Element {
	const raw = visual.value || "?";
	const fit = useMemo<TextFit>(() => {
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

		// `lineScale` is the preferred size as a percentage of the frame's
		// inline size — the same proportion the old `NNcqi` font-size
		// declarations expressed. Minimum floors preserve legibility:
		// 8px keeps single-line marks readable inside the ~28px list-row
		// frame (the previous 4px floor rendered dot-sized glyphs), and
		// five- and six-grapheme badges (PLUGIN / SCRIPT / IMPORT /
		// PRESET) cannot hold 8px on one line inside that frame, so their
		// floor drops to 5px — still above the dot-collapse range.
		const lineScale = lines.length >= 3 ? 10 : lines.length >= 2 ? 13 : 18;
		const minFontPx = badgeLength && ch > 4 ? 5 : 8;
		return { lines, lineScale, minFontPx };
	}, [raw]);

	const shellRef = useRef<HTMLSpanElement>(null);
	const metrics = useFrameMetrics(shellRef);
	const [fontPx, setFontPx] = useState<number | null>(null);

	useEffect(() => {
		const el = shellRef.current;
		if (!metrics || !el) {
			setFontPx(null);
			return;
		}
		const style = getComputedStyle(el);
		const px = fitTextFontPx({
			lines: fit.lines,
			boxWidth: metrics.boxWidth,
			contentWidth: metrics.contentWidth,
			contentHeight: metrics.contentHeight,
			preferredPct: fit.lineScale,
			minFontPx: fit.minFontPx,
			fontFamily: style.fontFamily,
			fontWeight: style.fontWeight,
			fontStyle: style.fontStyle,
		});
		setFontPx((prev) => (prev === px ? prev : px));
	}, [metrics, fit]);

	const textStyle = {
		...backgroundStyle(visual.backgroundColor),
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

export function WorkspacePresetGlyph({
	preset,
}: {
	preset: Preset;
}): JSX.Element {
	const visual = resolveWorkspaceGlyphIconVisual(preset);
	if (visual.kind === "image") {
		return <GlyphCachedImage imagePath={visual.value} />;
	}
	if (visual.kind === "emoji") {
		return <EmojiGlyph visual={visual} />;
	}
	if (visual.kind === "canvas") {
		return <CanvasGlyph visual={visual} />;
	}
	return <TextGlyph visual={visual} />;
}

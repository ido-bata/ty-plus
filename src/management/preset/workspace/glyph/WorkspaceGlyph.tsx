import { cx } from "@ty-plus/ui/util/cx";
import type { CSSProperties, HTMLAttributes, JSX, ReactNode } from "react";
import { resolveWorkspaceGlyphIconVisual } from "@/management/preset/assets/icons";
import type { Preset } from "@/management/preset/contract";
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
	containerType: "size",
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
	borderRadius: "min(12px,15cqi)",
	padding: "0.5px",
});

const wsEmojiInnerClass = css({
	display: "flex",
	width: "full",
	height: "full",
	alignItems: "center",
	justifyContent: "center",
	textAlign: "center",
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
	borderRadius: "min(12px,15cqi)",
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
	borderRadius: "min(12px,15cqi)",
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
});

const textInheritClass = css({ color: "inherit" });
const textPrimaryClass = css({ color: "text.primary" });

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
		const emojiStyle = {
			...(visual.backgroundColor
				? { backgroundColor: visual.backgroundColor }
				: {}),
		} as CSSProperties;
		return (
			<span
				data-ws-preset-text-fit="scale"
				className={`ws-preset-icon ws-preset-icon--emoji ${wsPresetEmojiShellClass}`}
				style={emojiStyle}
				aria-hidden="true"
			>
				<span
					className={wsEmojiInnerClass}
					style={{ fontSize: "clamp(4px, 100cqi, 96px)" }}
				>
					{visual.value}
				</span>
			</span>
		);
	}

	if (visual.kind === "canvas") {
		const [_x1, _y1, _x2, _y2] = visual.cubic;
		const canvasStyle = {
			...(visual.backgroundColor
				? { backgroundColor: visual.backgroundColor }
				: {}),
		} as CSSProperties;
		return (
			<span
				className={`ws-preset-icon ws-preset-icon--canvas ${wsPresetCanvasShellClass}`}
				style={canvasStyle}
				aria-hidden="true"
			>
				<CanvasEasingIcon
					cubic={visual.cubic}
					color={visual.color ?? "currentColor"}
				/>
			</span>
		);
	}

	const raw = visual.value || "?";
	const graphemes = Array.from(raw);
	const ch = Math.max(1, graphemes.length);

	// Multi-line: break into lines of ~sqrt(n) graphemes so boxes stay roughly square.
	const charsPerLine = Math.ceil(Math.sqrt(ch));
	const lines: string[] = [];
	for (let i = 0; i < graphemes.length; i += charsPerLine) {
		lines.push(graphemes.slice(i, i + charsPerLine).join(""));
	}

	// Use CSS custom property with container query (cqi = container query inline).
	// Set on outer span so children can inherit. cqi = 1% of container's inline size.
	// Minimum 4px, max 96px.  The previous 6/8/10 scales rendered ~5-7px glyphs
	// at typical ~70px previews — below legibility — so single-line marks now
	// get ~18% of the container width.
	const lineScale = lines.length >= 3 ? 10 : lines.length >= 2 ? 13 : 18;

	const textStyle = {
		...(visual.backgroundColor
			? { backgroundColor: visual.backgroundColor }
			: {}),
		...(visual.color ? { color: visual.color } : {}),
	} as CSSProperties;

	return (
		<span
			data-ws-preset-text-fit="scale"
			className={cx(
				`ws-preset-icon ws-preset-icon--text ${wsPresetTextShellClass}`,
				visual.color ? "" : textPrimaryClass,
			)}
			style={textStyle}
			aria-hidden="true"
		>
			{lines.map((line) => (
				<span
					key={line}
					className={cx(
						wsPresetTextLineClass,
						visual.color ? textInheritClass : textPrimaryClass,
					)}
					style={
						{
							fontSize: `clamp(4px, ${lineScale}cqi, 96px)`,
						} as CSSProperties
					}
				>
					{line}
				</span>
			))}
		</span>
	);
}

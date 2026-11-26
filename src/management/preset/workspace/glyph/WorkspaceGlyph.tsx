import { cx } from "@ty-plus/ui";
import type { HTMLAttributes, JSX, ReactNode } from "react";
import { resolveWorkspaceGlyphIconVisual } from "@/management/preset/assets/icons";
import type { Preset } from "@/management/preset/contract";
import { GlyphCachedImage } from "@/management/preset/workspace/glyph/CachedImage";
import { CanvasGlyph } from "@/management/preset/workspace/glyph/CanvasGlyph";
import {
	DEFAULT_EMOJI_CLASS,
	frameBase,
	framedTextClass,
} from "@/management/preset/workspace/glyph/classes";
import { EmojiGlyph } from "@/management/preset/workspace/glyph/EmojiGlyph";
import { TextGlyph } from "@/management/preset/workspace/glyph/TextGlyph";
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

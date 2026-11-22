import type { CSSProperties, JSX } from "react";
import type { PresetIcon } from "@/management/preset/contract";
import { css } from "@/styled-system/css";

/**
 * The preset icon's visual content.
 *
 * A `PresetIcon` is a preset-domain value (`text` / `emoji` / `image`), so
 * turning it into pixels is the preset feature's debt — not the file browser
 * kit's. The browser kit used to own this and grew a second, divergent copy
 * while doing so.
 *
 * The renderer returns the *content* only; the caller owns the frame, because
 * the frame differs per surface (a bare glyph in a list row, a clipped image
 * in a tile's media band).
 */

/**
 * The text glyph scales with the rendered size, which is a runtime value.
 * It travels as a CSS custom property so the declaration stays token-checked
 * (`css()` owns the font, the variable only carries the computed size).
 */
const monoTextClass = css({
	fontFamily: "mono",
	fontWeight: "semibold",
	lineHeight: "none",
	fontSize: "var(--preset-glyph-font-size)",
});

const emojiTextClass = css({
	fontSize: "base",
	lineHeight: "none",
});

const coverImageClass = css({
	width: "full",
	height: "full",
	objectFit: "cover",
	objectPosition: "center",
});

export type PresetIconContentProps = {
	icon: PresetIcon;
	/** Rendered size in px; used for the text glyph scale. */
	size: number;
};

/**
 * Returns `null` for an icon that cannot be rendered (an image preset with a
 * blank source), so the caller can fall back to the file-type glyph.
 */
export function PresetIconContent({
	icon,
	size,
}: PresetIconContentProps): JSX.Element | null {
	if (icon.type === "text") {
		const text = icon.param.text;
		return (
			<span
				className={monoTextClass}
				style={
					{ "--preset-glyph-font-size": `${size * 0.52}px` } as CSSProperties
				}
			>
				{text.slice(0, 2)}
			</span>
		);
	}
	if (icon.type === "emoji") {
		return <span className={emojiTextClass}>{icon.param.emoji}</span>;
	}
	if (icon.type === "image") {
		const src = icon.param.src.trim();
		if (!src) return null;
		return (
			<img
				src={src}
				alt=""
				decoding="async"
				draggable={false}
				className={coverImageClass}
			/>
		);
	}
	return null;
}

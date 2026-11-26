import type { JSX } from "react";
import { useEffect, useRef, useState } from "react";
import type { PresetIcon } from "@/management/preset/contract";
import { measureFrame, observeFrameSize } from "@/management/preset/frame-fit";
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
 * The px size is applied inline by `PresetTextIcon` — container-query
 * units cannot express it because the CEP host (CEF 99) has no container
 * queries (#700).
 */
const monoTextClass = css({
	fontFamily: "mono",
	fontWeight: "semibold",
	lineHeight: "none",
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
 * Text preset icon. The nominal size (`size * 0.52`) is capped at 52% of
 * the frame's rendered block size — the old `min(var(--…), 52cqh)` — so a
 * fill-mode frame smaller than `size` cannot overflow (#507). CEF 99 has
 * no `cqh`, so the frame (this span's parent, e.g. `FileEntryGlyph`'s
 * `IconFrame`) is measured with `ResizeObserver` instead.
 */
function PresetTextIcon({
	text,
	size,
}: {
	text: string;
	size: number;
}): JSX.Element {
	const ref = useRef<HTMLSpanElement>(null);
	const [fontPx, setFontPx] = useState<number | null>(null);
	useEffect(() => {
		const frame = ref.current?.parentElement;
		if (!frame || typeof ResizeObserver === "undefined") {
			setFontPx(null);
			return;
		}
		const update = () => {
			const px = Math.min(
				size * 0.52,
				measureFrame(frame).contentHeight * 0.52,
			);
			setFontPx((prev) => (prev === px ? prev : px));
		};
		update();
		return observeFrameSize(frame, update);
	}, [size]);
	return (
		<span
			ref={ref}
			className={monoTextClass}
			style={{ fontSize: `${fontPx ?? size * 0.52}px` }}
		>
			{text.slice(0, 2)}
		</span>
	);
}

/**
 * Returns `null` for an icon that cannot be rendered (an image preset with a
 * blank source), so the caller can fall back to the file-type glyph.
 */
export function PresetIconContent({
	icon,
	size,
}: PresetIconContentProps): JSX.Element | null {
	if (icon.type === "text") {
		return <PresetTextIcon text={icon.param.text} size={size} />;
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

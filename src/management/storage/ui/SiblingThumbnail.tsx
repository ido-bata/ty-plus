import type { JSX } from "react";
import { useThumbnail } from "@/function/widget/utility/directory-browser/hooks/useThumbnail";
import {
	findSiblingImagePathForPresetFile,
	type SiblingListingEntry,
	siblingThumbnailEntryFor,
} from "@/management/preset/sibling-thumbnail";
import { cx } from "@/shared/util/cx";
import { css } from "@/styled-system/css";

/**
 * Legacy directory-browser sibling renderer.
 *
 * Mirrors the sidecar branch in
 * `function/widget/utility/directory-browser/EntryThumb` but for the
 * legacy `DirectoryBrowser` shell used by the onboarding flow, settings
 * dialog, and tool shell. Routes the sibling image through the same
 * `useThumbnail` hook so the rendered `<img src>` is the ADR-003 WebP
 * cache URL instead of a raw `file://` path.
 *
 * Pre-CHB-2026-09-06 this branch rendered
 * `<img src={imageSrcForBrowser(sidekick)}>` directly, which (a)
 * bypassed the Rust WebP pipeline and (b) could blow past CEP's
 * `file://` / `http(s)` allow-list on managed paths.
 */

const wrapperClass = css({
	display: "flex",
	height: "full",
	width: "full",
	alignItems: "center",
	justifyContent: "center",
	overflow: "hidden",
});
// The PandaCSS `_groupHover` recipe compiles to `.group:is(:hover, [data-hover]) .<child>`.
// The Tailwind-era wrapper carried the literal `group` class; the PandaCSS migration
// dropped it, which silently disabled the animated-thumbnail fade. Re-add the marker.
const groupClass = cx(
	"group",
	css({
		position: "relative",
		height: "full",
		width: "full",
	}),
);
const imgBaseClass = css({
	position: "absolute",
	inset: 0,
	height: "full",
	width: "full",
	objectFit: "cover",
	objectPosition: "center",
});
const hoverImgClass = css({
	opacity: 0,
	transitionProperty: "opacity",
	_groupHover: { opacity: 1 },
});

export function SiblingThumbnail(props: {
	entry: { path: string; isDirectory: boolean };
	allEntries: readonly SiblingListingEntry[];
	size?: number;
	/**
	 * When true, fill the parent instead of fixing to `size` px.
	 * Used by full-bleed grid tiles; list rows keep passing `size`.
	 */
	fill?: boolean;
}): JSX.Element | null {
	const { entry, allEntries, size, fill } = props;
	const sidekickPath = !entry.isDirectory
		? findSiblingImagePathForPresetFile(entry.path, allEntries)
		: null;
	const synthetic = sidekickPath
		? siblingThumbnailEntryFor(sidekickPath)
		: { ...siblingThumbnailEntryFor(""), path: "" };
	const { staticUrl, animatedUrl } = useThumbnail(synthetic);
	if (!sidekickPath || !staticUrl) {
		return null;
	}
	return (
		<div
			className={wrapperClass}
			style={!fill && size != null ? { width: size, height: size } : undefined}
		>
			<div className={groupClass}>
				<img
					src={staticUrl}
					alt=""
					decoding="async"
					draggable={false}
					className={imgBaseClass}
				/>
				{animatedUrl ? (
					<img
						src={animatedUrl}
						alt=""
						decoding="async"
						draggable={false}
						className={`${imgBaseClass} ${hoverImgClass}`}
					/>
				) : null}
			</div>
		</div>
	);
}

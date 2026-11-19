import { File, Folder, FolderOpen } from "lucide-react";
import type { JSX } from "react";
import { useMemo } from "react";
import { useThumbnail } from "@/function/widget/utility/directory-browser/hooks/useThumbnail";

import type {
	Preset,
	PresetIcon,
	PresetType,
} from "@/management/preset/contract";
import { isDefaultPresetIcon } from "@/management/preset/icon-data";
import { imageSrcForBrowser } from "@/management/preset/image-src-for-browser";
import {
	findSiblingImagePathForPresetFile,
	isPresetSidekickSourcePath,
	type SiblingListingEntry,
	siblingThumbnailEntryFor,
} from "@/management/preset/sibling-thumbnail";
import { CanvasEasingIcon } from "@/management/preset/workspace/CanvasEasingIcon";
import { cx } from "@/shared/util/cx";
import { css } from "@/styled-system/css";
import { FILE_TYPE_ICON } from "../../file-type-icon";
import type { DirectoryBrowserEntry } from "./Component";

const presetTypeForFileType = (
	fileType: DirectoryBrowserEntry["fileType"],
): PresetType => {
	if (fileType === "script") return "script";
	if (fileType === "plugin") return "plugin";
	return "preset";
};

const iconFrameBaseClass = css({
	display: "inline-flex",
	flexShrink: 0,
	alignItems: "center",
	justifyContent: "center",
	overflow: "hidden",
	color: "text.primary",
});
const iconFrameFillClass = css({
	height: "full",
	width: "full",
});
const fullSizeClass = css({
	height: "full",
	width: "full",
});
const coverImageClass = css({
	height: "full",
	width: "full",
	objectFit: "cover",
	objectPosition: "center",
});
const monoTextClass = css({
	fontFamily: "mono",
	fontWeight: "semibold",
	lineHeight: "none",
});
const emojiTextClass = css({
	fontSize: "base",
	lineHeight: "none",
});

function IconFrame({
	size,
	children,
	className,
	fill,
}: {
	size: number;
	children: React.ReactNode;
	className?: string;
	/** When true, fill the parent instead of fixing to `size` px. */
	fill?: boolean;
}): JSX.Element {
	return (
		<span
			className={cx(iconFrameBaseClass, fill && iconFrameFillClass, className)}
			style={fill ? undefined : { width: size, height: size }}
		>
			{children}
		</span>
	);
}

export function EntryIcon({
	entry,
	size,
	allEntries,
	fill,
}: {
	entry: DirectoryBrowserEntry;
	size?: number;
	allEntries?: readonly SiblingListingEntry[];
	fill?: boolean;
}): JSX.Element {
	// Sidecar sibling lookup runs before the early returns so the
	// `useThumbnail` hook below is called unconditionally (rules of hooks).
	const sidekickPath =
		!entry.isDirectory && allEntries && isPresetSidekickSourcePath(entry.path)
			? findSiblingImagePathForPresetFile(entry.path, allEntries)
			: null;
	const sidekickEntry = useMemo(
		() => (sidekickPath ? siblingThumbnailEntryFor(sidekickPath) : null),
		[sidekickPath],
	);
	const sidekickThumb = useThumbnail(
		sidekickEntry ?? {
			name: "",
			path: "",
			isDirectory: false,
			size: 0,
			modifiedAt: "",
			extension: "",
			fileType: "image" as const,
		},
	);

	if (entry.path === "" && entry.isDirectory) {
		const s = size ?? 24;
		return (
			<IconFrame size={s} fill={fill}>
				<FolderOpen className={fullSizeClass} aria-hidden />
			</IconFrame>
		);
	}
	const s = size ?? 24;
	if (entry.fileType === "image" && entry.previewUrl?.trim()) {
		return (
			<IconFrame size={s} fill={fill}>
				<img
					src={entry.previewUrl.trim()}
					alt=""
					decoding="async"
					draggable={false}
					className={coverImageClass}
				/>
			</IconFrame>
		);
	}
	// Icon contract (issue #191): a persisted *custom* icon wins over every
	// derived source; a materialized type default does not — sibling
	// sidecar images resolved through the thumbnail pipeline outrank it.
	const presetType = presetTypeForFileType(entry.fileType);
	const hasCustomIcon =
		entry.icon != null &&
		!isDefaultPresetIcon(presetType, entry.icon as Preset["icon"]);
	if (hasCustomIcon && entry.icon) {
		const rendered = renderPresetIcon(entry.icon, s, fill);
		if (rendered) return rendered;
	}
	if (sidekickPath && sidekickThumb.staticUrl) {
		// Sidecar images render only through the thumbnail pipeline (Rust
		// WebP cache + gateway allow-list). There is no raw `file://`
		// fallback: when the pipeline has no resolved URL the entry falls
		// through to its persisted icon or type glyph.
		return (
			<IconFrame size={s} fill={fill}>
				<img
					src={sidekickThumb.staticUrl}
					alt=""
					decoding="async"
					draggable={false}
					className={coverImageClass}
				/>
			</IconFrame>
		);
	}
	if (entry.icon) {
		const rendered = renderPresetIcon(entry.icon, s, fill);
		if (rendered) return rendered;
	}
	// File-type glyph fallback comes from the shared table so every
	// directory-browser surface renders the same icon for the same file
	// (issue #191 audit — this used to be a divergent per-surface copy
	// that collapsed most types to Film and lacked font/psd/ai/c4d/json).
	if (entry.isDirectory) {
		return (
			<IconFrame size={s} fill={fill}>
				<Folder className={fullSizeClass} aria-hidden />
			</IconFrame>
		);
	}
	const Glyph = entry.fileType
		? (FILE_TYPE_ICON[entry.fileType] ?? File)
		: File;
	return (
		<IconFrame size={s} fill={fill}>
			<Glyph className={fullSizeClass} aria-hidden />
		</IconFrame>
	);
}

function renderPresetIcon(
	icon: PresetIcon,
	size: number,
	fill?: boolean,
): JSX.Element | null {
	if (icon.type === "text") {
		const t = icon.param.text;
		return (
			<IconFrame size={size} fill={fill}>
				<span
					className={monoTextClass}
					style={fill ? undefined : { fontSize: size * 0.52 }}
				>
					{t.slice(0, 2)}
				</span>
			</IconFrame>
		);
	}
	if (icon.type === "emoji") {
		const e = icon.param.emoji;
		return (
			<IconFrame size={size} fill={fill}>
				<span className={emojiTextClass}>{e}</span>
			</IconFrame>
		);
	}
	if (icon.type === "image") {
		const src = icon.param.src.trim();
		if (!src) return null;
		return <EntryPresetIconImage src={src} size={size} fill={fill} />;
	}
	if (icon.type === "canvas" && icon.param.cubic) {
		return (
			<IconFrame size={size} fill={fill}>
				<CanvasEasingIcon
					cubic={icon.param.cubic}
					points={icon.param.points}
					color={icon.param.color ?? "currentColor"}
				/>
			</IconFrame>
		);
	}
	return null;
}

/**
 * Renders a persisted image icon through the thumbnail pipeline
 * (Rust WebP cache + gateway) — the same route sidecar images take.
 * There is intentionally no raw `file://`/path `<img>` fallback: when
 * the pipeline has no resolved URL the caller falls through to the
 * next icon priority (issue #191).
 */
function EntryPresetIconImage({
	src,
	size,
	fill,
}: {
	src: string;
	size: number;
	fill?: boolean;
}): JSX.Element | null {
	const thumbEntry = useMemo(() => siblingThumbnailEntryFor(src), [src]);
	const thumb = useThumbnail(thumbEntry);
	const url = thumb.staticUrl;
	if (!url) {
		return null;
	}
	return (
		<IconFrame size={size} fill={fill}>
			<img
				src={url}
				alt=""
				decoding="async"
				draggable={false}
				className={coverImageClass}
			/>
		</IconFrame>
	);
}

export function MediaCardContent({
	entry,
}: {
	entry: DirectoryBrowserEntry;
}): JSX.Element | null {
	if (entry.fileType === "image" && entry.previewUrl?.trim()) {
		// `previewUrl` is already a browser-ready URL (`file:` from
		// file-browser-service, `data:` in previews) — pass it through like
		// `EntryIcon` does instead of re-validating it as a file path, which
		// would reject `data:` URIs and collapse to `src=""`.
		return (
			<img
				src={entry.previewUrl.trim()}
				alt=""
				className={coverImageClass}
				decoding="async"
				draggable={false}
			/>
		);
	}
	if (entry.fileType === "video") {
		const src = imageSrcForBrowser(entry.path);
		if (!src) return null;
		return (
			<video
				src={src}
				className={coverImageClass}
				muted
				preload="metadata"
				onMouseEnter={(e) => {
					const video = e.currentTarget;
					video.play().catch(() => {});
				}}
				onMouseLeave={(e) => {
					const video = e.currentTarget;
					video.pause();
					video.currentTime = 0;
				}}
			/>
		);
	}
	return null;
}

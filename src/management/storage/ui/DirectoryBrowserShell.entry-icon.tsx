import type { LucideIcon } from "lucide-react";
import {
	File,
	Film,
	Folder,
	FolderOpen,
	Image as ImageIcon,
	Music,
} from "lucide-react";
import type { JSX } from "react";
import { useMemo } from "react";
import { useThumbnail } from "@/function/widget/utility/directory-browser/hooks/useThumbnail";

import type { PresetIcon } from "@/management/preset/contract";
import { imageSrcForBrowser } from "@/management/preset/image-src-for-browser";
import {
	findSiblingImagePathForPresetFile,
	type SiblingListingEntry,
	siblingThumbnailEntryFor,
} from "@/management/preset/sibling-thumbnail";
import { cx } from "@/shared/util/cx";
import { css } from "@/styled-system/css";
import type { DirectoryBrowserEntry } from "./DirectoryBrowser";

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
		!entry.isDirectory && allEntries
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
	if (sidekickPath) {
		// Prefer the thumbnail pipeline (Rust WebP cache + gateway
		// allow-list) like `EntryThumb` / `SiblingThumbnail` do. While the
		// pipeline has no resolved URL — or no gateway exists in this
		// context — fall back to the raw `file://` path, and finally to
		// the type icon when the path is not browser-resolvable.
		if (sidekickThumb.staticUrl) {
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
		// `imageSrcForBrowser` rejects non-absolute / non-URL paths and returns
		// "" — rendering `<img src="">` logs a console error, so fall through
		// to the type icon instead.
		const sidekickSrc = imageSrcForBrowser(sidekickPath);
		if (sidekickSrc) {
			return (
				<IconFrame size={s} fill={fill}>
					<img
						src={sidekickSrc}
						alt=""
						decoding="async"
						draggable={false}
						className={coverImageClass}
					/>
				</IconFrame>
			);
		}
	}
	if (entry.icon) {
		const rendered = renderPresetIcon(entry.icon, s, fill);
		if (rendered) return rendered;
	}
	if (entry.fileType === "video") {
		return (
			<IconFrame size={s} fill={fill}>
				<Film className={fullSizeClass} aria-hidden />
			</IconFrame>
		);
	}
	if (entry.fileType === "audio") {
		return (
			<IconFrame size={s} fill={fill}>
				<Music className={fullSizeClass} aria-hidden />
			</IconFrame>
		);
	}
	if (entry.fileType === "image") {
		return (
			<IconFrame size={s} fill={fill}>
				<ImageIcon className={fullSizeClass} aria-hidden />
			</IconFrame>
		);
	}
	if (entry.fileType === "image-sequence") {
		return (
			<IconFrame size={s} fill={fill}>
				<Film className={fullSizeClass} aria-hidden />
			</IconFrame>
		);
	}
	if (entry.fileType === "ae-preset") {
		return (
			<IconFrame size={s} fill={fill}>
				<Film className={fullSizeClass} aria-hidden />
			</IconFrame>
		);
	}
	if (entry.fileType === "script") {
		return (
			<IconFrame size={s} fill={fill}>
				<Film className={fullSizeClass} aria-hidden />
			</IconFrame>
		);
	}
	if (entry.fileType === "plugin") {
		return (
			<IconFrame size={s} fill={fill}>
				<Film className={fullSizeClass} aria-hidden />
			</IconFrame>
		);
	}
	if (entry.fileType === "mogrt") {
		return (
			<IconFrame size={s} fill={fill}>
				<Film className={fullSizeClass} aria-hidden />
			</IconFrame>
		);
	}
	const IconComponent: LucideIcon = entry.isDirectory ? Folder : File;
	return (
		<IconFrame size={s} fill={fill}>
			<IconComponent className={fullSizeClass} aria-hidden />
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
		return (
			<IconFrame size={size} fill={fill}>
				<img
					src={src}
					alt=""
					decoding="async"
					draggable={false}
					className={coverImageClass}
				/>
			</IconFrame>
		);
	}
	return null;
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

import { cx, Icon } from "@ty-plus/ui";
import { FolderOpen } from "lucide-react";
import type { JSX } from "react";
import { PresetIconContent } from "@/management/preset/icon-content";
import { imageSrcForBrowser } from "@/management/preset/image-src-for-browser";
import {
	findSiblingImagePathForPresetFile,
	type SiblingListingEntry,
} from "@/management/preset/sibling-thumbnail";
import { FileTypeGlyph } from "@/management/storage/file-type-glyph";
import { css } from "@/styled-system/css";
import type { FileEntry } from "./FileEntryList";

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

export function FileEntryGlyph({
	entry,
	size,
	allEntries,
	fill,
}: {
	entry: FileEntry;
	size?: number;
	allEntries?: readonly SiblingListingEntry[];
	fill?: boolean;
}): JSX.Element {
	if (entry.path === "" && entry.isDirectory) {
		const s = size ?? 24;
		return (
			<IconFrame size={s} fill={fill}>
				<Icon
					icon={FolderOpen}
					size={s}
					className={fullSizeClass}
					aria-hidden
				/>
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
	if (!entry.isDirectory && allEntries) {
		const sidekick = findSiblingImagePathForPresetFile(entry.path, allEntries);
		// `imageSrcForBrowser` rejects non-absolute / non-URL paths and returns
		// "" — rendering `<img src="">` logs a console error, so fall through
		// to the type icon instead.
		const sidekickSrc = sidekick ? imageSrcForBrowser(sidekick) : "";
		if (sidekick && sidekickSrc) {
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
	// A preset icon is a preset-domain value, so its rendering is the preset
	// feature's debt (`management/preset/icon-content.tsx`).
	if (entry.icon) {
		const content = <PresetIconContent icon={entry.icon} size={s} />;
		if (content) {
			return (
				<IconFrame size={s} fill={fill}>
					{content}
				</IconFrame>
			);
		}
	}
	return (
		<IconFrame size={s} fill={fill}>
			<FileTypeGlyph
				fileType={entry.fileType}
				isDirectory={entry.isDirectory}
				size={s}
				className={fullSizeClass}
			/>
		</IconFrame>
	);
}

export function FileEntryMedia({
	entry,
}: {
	entry: FileEntry;
}): JSX.Element | null {
	if (entry.fileType === "image" && entry.previewUrl?.trim()) {
		// `previewUrl` is already a browser-ready URL (`file:` from
		// file-browser-service, `data:` in previews) — pass it through like
		// `FileEntryGlyph` does instead of re-validating it as a file path, which
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

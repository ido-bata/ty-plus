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

import type { PresetIcon } from "@/management/preset/contract";
import { imageSrcForBrowser } from "@/management/preset/image-src-for-browser";
import {
	findSiblingImagePathForPresetFile,
	type SiblingListingEntry,
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
	if (!entry.isDirectory && allEntries) {
		const sidekick = findSiblingImagePathForPresetFile(entry.path, allEntries);
		if (sidekick) {
			return (
				<IconFrame size={s} fill={fill}>
					<img
						src={imageSrcForBrowser(sidekick)}
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
		const src = icon.param.src;
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
		return (
			<img
				src={imageSrcForBrowser(entry.previewUrl.trim())}
				alt=""
				className={coverImageClass}
				decoding="async"
				draggable={false}
			/>
		);
	}
	if (entry.fileType === "video") {
		const src = imageSrcForBrowser(entry.path);
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

import type { JSX } from "react";
import { useMemo } from "react";
import { findSiblingImagePathForPresetFile } from "@/management/preset/sibling-thumbnail";
import {
	canUseCepNodeFileBrowser,
	createCepNodeFileBrowserService,
	type FileBrowserEntry,
} from "@/management/storage/file-browser-service";
import { css } from "@/styled-system/css";
import { EntryGlyph } from "./EntryGlyph";
import { useFolderPreview } from "./hooks/useFolderPreview";
import { useThumbnail } from "./hooks/useThumbnail";
import { ThumbnailTile } from "./ThumbnailTile";

/**
 * Build a synthetic `FileBrowserEntry` for a sidecar sibling image so
 * it can be fed through [`useThumbnail`] (which is keyed off
 * `FileBrowserEntry` shape — path / size / mtime / fileType).
 *
 * `mtime` is read off the source file via `useThumbnail`'s
 * `entry.modifiedAt`; we deliberately set it to `new Date(0).toISOString()`
 * when the sidecar file's mtime is unavailable, which causes
 * `useThumbnail` to fall back to a generate call (the cache miss is
 * preferred over a stale hit). The pipeline's meta-marker validation
 * rejects `mtime_ms == 0` in the Rust side, so the React hook feeds a
 * real timestamp into the wire payload.
 */
function siblingEntryFor(
	entry: FileBrowserEntry,
	sidekickPath: string,
	size: number,
	modifiedAt: string,
): FileBrowserEntry {
	return {
		name: sidekickPath.replace(/\\/g, "/").split("/").pop() ?? sidekickPath,
		path: sidekickPath,
		isDirectory: false,
		size,
		modifiedAt,
		extension: ".png",
		fileType: "image",
	};
}

/**
 * Renders the icon-area inside a filesystem tile or row.
 *
 * Resolution order:
 *
 * 1. **Directories** — if a sibling `folder_preview.png` exists inside
 *    the directory, route it through the gateway via a synthetic
 *    `useThumbnail` call so the same WebP cache URL is used everywhere.
 *    Without a folder_preview, fall back to the folder glyph.
 * 2. **Images** with a populated `previewUrl` — render through
 *    `ThumbnailTile` so the gateway-cached thumbnail is used (and the
 *    animated GIF/SVG swap-on-hover kicks in for sources that have
 *    an animated variant).
 * 3. **Preset files** with a sibling image — render the sibling image
 *    via `useThumbnail`, falling back to the entry glyph while the
 *    cache URL is resolving.
 * 4. **Everything else** — fall back to `EntryGlyph`.
 *
 * The `FileBrowserService` is created lazily inside the component
 * (matching the `useFileBrowserDirectory` pattern) so we don't have to
 * plumb it through every layer from `Component.tsx` down. In tests
 * where CEP Node is unavailable, the service is `null` and the
 * directory branch falls straight through to the folder glyph.
 *
 * Pre-CHB-2026-09-06 sibling rendering used raw `<img
 * src={imageSrcForBrowser(filePath)}>` paths, which (a) bypassed the
 * Rust WebP pipeline and (b) could blow past CEP's `file://` /
 * `http(s)` allow-list on managed paths. Routing through
 * `useThumbnail` keeps both invariants in place.
 */
export function EntryThumb(props: {
	entry: FileBrowserEntry;
	siblingSourceEntries: readonly FileBrowserEntry[];
	glyphSize: number;
	glyphClassName: string;
}): JSX.Element {
	const { entry, siblingSourceEntries, glyphSize, glyphClassName } = props;
	const service = useMemo(() => {
		if (typeof window !== "undefined" && canUseCepNodeFileBrowser(window)) {
			return createCepNodeFileBrowserService({ win: window });
		}
		return null;
	}, []);
	// Always invoke the hook at the top level so React's rules of hooks
	// are satisfied; an empty `dirPath` short-circuits to `null` inside
	// the hook, which is what we want for non-directory entries.
	const folderPreview = useFolderPreview(
		entry.isDirectory ? entry.path : "",
		service,
	);

	// Sidecar sibling lookup is cheap and runs in render; we keep it
	// outside of `useThumbnail` because `useThumbnail` is keyed off the
	// `entry` argument, not an inline lookup result.
	const sidekickPath = !entry.isDirectory
		? findSiblingImagePathForPresetFile(entry.path, siblingSourceEntries)
		: null;
	const sidekickEntry = useMemo(() => {
		if (!sidekickPath) {
			return null;
		}
		return siblingEntryFor(entry, sidekickPath, entry.size, entry.modifiedAt);
	}, [sidekickPath, entry]);
	const sidekickThumb = useThumbnail(
		sidekickEntry ?? {
			// Neutral placeholder entry — keeps `useThumbnail` happy when
			// there is no sidecar, and short-circuits to `idle` because
			// the dedup key contains the placeholder path.
			name: "",
			path: "",
			isDirectory: false,
			size: 0,
			modifiedAt: entry.modifiedAt,
			extension: "",
			fileType: "image",
		},
	);

	if (entry.isDirectory) {
		if (folderPreview) {
			const previewEntry: FileBrowserEntry = {
				name: "folder_preview.png",
				path: folderPreview,
				isDirectory: false,
				size: 0,
				modifiedAt: entry.modifiedAt,
				extension: ".png",
				fileType: "image",
			};
			return <ThumbnailTile entry={previewEntry} />;
		}
		return (
			<div
				className={css({
					display: "flex",
					height: "full",
					width: "full",
					alignItems: "center",
					justifyContent: "center",
					padding: "0.5",
				})}
			>
				<EntryGlyph entry={entry} size={glyphSize} className={glyphClassName} />
			</div>
		);
	}
	if (entry.fileType === "image" && entry.previewUrl?.trim()) {
		return <ThumbnailTile entry={entry} />;
	}
	if (sidekickPath && sidekickThumb.staticUrl) {
		return (
			<div
				className={css({ position: "relative", height: "full", width: "full" })}
			>
				<img
					src={sidekickThumb.staticUrl}
					alt=""
					decoding="async"
					draggable={false}
					className={css({
						position: "absolute",
						inset: 0,
						height: "full",
						width: "full",
						objectFit: "cover",
						objectPosition: "center",
					})}
				/>
				{sidekickThumb.animatedUrl ? (
					<img
						src={sidekickThumb.animatedUrl}
						alt=""
						decoding="async"
						draggable={false}
						className={css({
							position: "absolute",
							inset: 0,
							height: "full",
							width: "full",
							objectFit: "cover",
							objectPosition: "center",
							opacity: 0,
							transitionProperty: "opacity",
							_hover: { opacity: 1 },
						})}
					/>
				) : null}
			</div>
		);
	}
	return (
		<div
			className={css({
				display: "flex",
				height: "full",
				width: "full",
				alignItems: "center",
				justifyContent: "center",
				padding: "0.5",
			})}
		>
			<EntryGlyph entry={entry} size={glyphSize} className={glyphClassName} />
		</div>
	);
}

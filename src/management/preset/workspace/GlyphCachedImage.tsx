import type { JSX } from "react";
import { ThumbnailTile } from "@/function/widget/utility/directory-browser/ThumbnailTile";
import type { FileBrowserEntry } from "@/management/storage/file-browser-service";
import { css, cx } from "@/styled-system/css";

/**
 * Render a raw image path (typically a preset sidecar sibling that the
 * `WorkspacePresetGlyph` already resolved to a file path) through the
 * Rust thumbnail gateway, so the rendered `<img>` source is the same
 * WebP cache URL that the directory browser uses.
 *
 * Pre-CHB-2026-09-06 this branch rendered the raw path with
 * `imageSrcForBrowser(...)`. The issue tracks the migration to the
 * ADR-003 cache pipeline; this helper keeps the gate logic centralized
 * for every sibling / descriptionImage consumer so a future change only
 * touches one place.
 *
 * The synthetic `FileBrowserEntry` exists because `useThumbnail` (the
 * hook inside `ThumbnailTile`) is keyed off `entry.path / modifiedAt /
 * size / fileType`. The directory browser's real entries carry those
 * fields; the workspace sidecar resolution only knows the file path,
 * so we synthesize the rest with stable sentinels. The dedup key is
 * keyed off the entry fields verbatim, so the sentinel values must be
 * stable across renders for a single sibling path — using a fixed
 * ISO-8601 timestamp ensures React's hook never sees a different key
 * for the same source image.
 *
 * `mtime_ms == 0` is rejected by the Rust dispatcher, so we use a
 * fixed non-zero timestamp (`2026-01-01T00:00:00.000Z` — fixed in
 * CHB-2026-09-06). The pipeline will treat the synthetic mtime as
 * authoritative for cache invalidation; in practice every render
 * re-resolves the same sibling, so a sentinel is fine.
 */
const SYNTHETIC_TIMESTAMP = "2026-01-01T00:00:00.000Z";

const glyphImageClass = css({
	display: "flex",
	height: "full",
	minHeight: "0",
	width: "full",
	minWidth: "0",
	cursor: "pointer",
	alignItems: "center",
	justifyContent: "center",
	overflow: "hidden",
});

export function GlyphCachedImage(props: {
	imagePath: string;
	fallbackClassName?: string;
}): JSX.Element | null {
	const { imagePath, fallbackClassName } = props;
	if (!imagePath) {
		return null;
	}
	const syntheticEntry: FileBrowserEntry = {
		name: imagePath.replace(/\\/g, "/").split("/").pop() ?? imagePath,
		path: imagePath,
		isDirectory: false,
		size: 0,
		modifiedAt: SYNTHETIC_TIMESTAMP,
		extension: ".png",
		fileType: "image",
	};
	return (
		<span
			className={cx(
				`ws-preset-icon ws-preset-icon--image ${glyphImageClass}`,
				fallbackClassName ?? "",
			)}
			data-glyph-cached-image=""
		>
			<ThumbnailTile entry={syntheticEntry} />
		</span>
	);
}

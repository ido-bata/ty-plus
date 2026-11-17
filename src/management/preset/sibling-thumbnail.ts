/**
 * Normalizes a directory path for comparison and for `listDirectory` calls:
 * backslashes → slashes, strips trailing slashes, strips Win32 `\\?\` long-path prefix.
 */
export function normalizeSiblingDirPath(dirPath: string): string {
	const trimmed = dirPath.trim().replaceAll("\\", "/");
	if (!trimmed) {
		return "";
	}
	let v = trimmed;
	if (v.startsWith("//?/")) {
		v = v.slice(4);
	}
	return v.replace(/\/+$/, "") || v;
}

export const siblingPathKey = (value: string): string =>
	normalizeSiblingDirPath(value).toLowerCase();

export const stemWithoutExtension = (path: string): string => {
	const seg = path.replaceAll("\\", "/").split("/").pop() ?? path;
	const dot = seg.lastIndexOf(".");
	return dot > 0 ? seg.slice(0, dot) : seg;
};

export const parentDirectoryOf = (filePath: string): string => {
	const t = filePath.trim();
	if (!t) {
		return "";
	}
	const u = Math.max(t.lastIndexOf("/"), t.lastIndexOf("\\"));
	return u >= 0 ? t.slice(0, u) : "";
};

/** Image extensions eligible as a preset's sidecar/sibling thumbnail. */
export const SIBLING_IMAGE_NAME_RE = /\.(png|jpe?g|gif|webp|svg)$/i;

/**
 * Source extensions that may carry a sibling sidecar image next to them.
 * Single owner shared by the directory browser (function layer) and the
 * workspace glyph resolver (management layer).
 */
export const PRESET_SIDEKICK_SOURCE_EXTENSIONS: ReadonlySet<string> = new Set([
	".ffx",
	".jsx",
	".jsxbin",
	".aep",
	".aepx",
	".aet",
	".mogrt",
	".zxp",
]);

/** True when `path` ends in a sidekick-source extension (case-insensitive). */
export const isPresetSidekickSourcePath = (path: string): boolean => {
	const lower = path.trim().toLowerCase();
	for (const ext of PRESET_SIDEKICK_SOURCE_EXTENSIONS) {
		if (lower.endsWith(ext)) {
			return true;
		}
	}
	return false;
};

export type SiblingListingEntry = {
	name: string;
	path: string;
	isDirectory: boolean;
};

/**
 * When `presetFilePath` is `…/Foo.ffx`, returns `…/Foo.png` (etc.) if a matching image
 * exists in `entries` for the same parent directory and basename stem.
 */
export function findSiblingImagePathForPresetFile(
	presetFilePath: string,
	entries: ReadonlyArray<SiblingListingEntry>,
): string | null {
	const wantStem = stemWithoutExtension(presetFilePath).toLowerCase();
	if (!wantStem) {
		return null;
	}
	const wantParentKey = siblingPathKey(
		normalizeSiblingDirPath(parentDirectoryOf(presetFilePath)),
	);
	if (!wantParentKey) {
		return null;
	}
	for (const e of entries) {
		if (e.isDirectory) {
			continue;
		}
		if (!SIBLING_IMAGE_NAME_RE.test(e.name)) {
			continue;
		}
		const entryParentKey = siblingPathKey(
			normalizeSiblingDirPath(parentDirectoryOf(e.path)),
		);
		if (entryParentKey !== wantParentKey) {
			continue;
		}
		if (stemWithoutExtension(e.path).toLowerCase() === wantStem) {
			return e.path;
		}
	}
	return null;
}

// Sentinel timestamp shared by every sidecar-thumbnail consumer so the
// panel-side dedup map stays stable across renders for the same path.
const SYNTHETIC_SIBLING_TIMESTAMP = "2026-01-01T00:00:00.000Z";

/**
 * Builds the synthetic `FileBrowserEntry`-shaped object the thumbnail
 * pipeline (`useThumbnail`) expects for a sidecar image path. The shape is
 * structural — callers pass it to `useThumbnail` / `ThumbnailTile` without
 * importing the storage-layer type here.
 */
export const siblingThumbnailEntryFor = (
	sidekickPath: string,
	opts?: { size?: number; modifiedAt?: string },
) => {
	const name =
		sidekickPath.replaceAll("\\", "/").split("/").pop() ?? sidekickPath;
	const dot = name.lastIndexOf(".");
	return {
		name,
		path: sidekickPath,
		isDirectory: false,
		size: opts?.size ?? 0,
		modifiedAt: opts?.modifiedAt ?? SYNTHETIC_SIBLING_TIMESTAMP,
		extension: dot > 0 ? name.slice(dot).toLowerCase() : "",
		fileType: "image" as const,
	};
};

export async function resolveSiblingImageIconSrc(
	filePath: string,
	listDirectoryFn: (dirPath: string) => Promise<SiblingListingEntry[]>,
	dirCache: Map<string, SiblingListingEntry[]>,
): Promise<string | null> {
	const parent = normalizeSiblingDirPath(parentDirectoryOf(filePath));
	if (!parent) {
		return null;
	}
	const cacheKey = siblingPathKey(parent);
	let bucket = dirCache.get(cacheKey);
	if (!bucket) {
		bucket = await listDirectoryFn(parent);
		dirCache.set(cacheKey, bucket);
	}
	return findSiblingImagePathForPresetFile(filePath, bucket);
}

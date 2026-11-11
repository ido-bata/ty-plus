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

const SIBLING_IMAGE_NAME_RE = /\.(png|jpe?g|gif|webp|svg)$/i;

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

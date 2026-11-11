const normalizeComparePath = (value: string): string =>
	value.trim().replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();

/** True when `child` is the same as or nested under `parent`. */
export const isPathSameOrNested = (parent: string, child: string): boolean => {
	const parentNorm = normalizeComparePath(parent);
	const childNorm = normalizeComparePath(child);
	if (!parentNorm || !childNorm) {
		return false;
	}
	return childNorm === parentNorm || childNorm.startsWith(`${parentNorm}/`);
};

export const assertSafeDirectoryCopy = (
	sourceDir: string,
	destDir: string,
): void => {
	const source = sourceDir.trim();
	const dest = destDir.trim();
	if (!source || !dest) {
		return;
	}
	if (normalizeComparePath(source) === normalizeComparePath(dest)) {
		throw new Error(
			"Copy source and destination are the same folder. Choose a different Support Root.",
		);
	}
	if (isPathSameOrNested(source, dest)) {
		throw new Error(
			"Copy destination is inside the source folder. Choose a different Support Root.",
		);
	}
	if (isPathSameOrNested(dest, source)) {
		throw new Error(
			"Copy source is inside the destination folder. Choose a different Support Root.",
		);
	}
};

/**
 * Throws when a Support Root delete target sits outside a trusted user-data root.
 * `trustedRoots` are absolute paths (typically My Documents / user home / app data)
 * that the delete caller has confirmed the user owns. The check defends against a
 * crafted settings.json that puts the Support Root under system folders which the
 * elevation helper would otherwise recursively delete.
 */
export const assertSafeSupportRootDelete = (
	target: string,
	trustedRoots: readonly string[],
): void => {
	const trimmed = target.trim();
	if (!trimmed) {
		return;
	}
	const hit = trustedRoots.some((r) => {
		const anchor = normalizeComparePath(r);
		return anchor.length > 0 && isPathSameOrNested(anchor, trimmed);
	});
	if (!hit) {
		throw new Error(
			"Refusing to delete Support Root contents: target is outside a trusted user-data root.",
		);
	}
};

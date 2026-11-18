import {
	canUseCepNodeFileBrowser,
	createCepNodeFileBrowserService,
} from "@/management/storage/file-browser-service";
import { type SiblingListingEntry, siblingPathKey } from "./sibling-thumbnail";

export type SiblingListDirectory = (
	dirPath: string,
) => Promise<readonly SiblingListingEntry[]>;

/**
 * Builds the `thumbnailListDirectory` callback consumed by
 * `usePresetSiblingImageSrc` / `PresetGlyphById` for surfaces that show
 * catalog presets but do not already own a directory listing (workspace
 * tiles, the preset catalog dialog, the preset info widget).
 *
 * Returns `undefined` when the CEP node file browser is unavailable, in
 * which case sibling derivation simply does not happen and the persisted
 * icon / type fallback applies. In-flight directory listings are deduped
 * per path so many tiles in the same folder share one `listDirectory`
 * call; settled results are not cached so later mounts re-read the
 * directory.
 */
export const createSiblingListDirectory = (
	win: Window,
): SiblingListDirectory | undefined => {
	if (!canUseCepNodeFileBrowser(win)) {
		return undefined;
	}
	const service = createCepNodeFileBrowserService({ win });
	const inflight = new Map<string, Promise<readonly SiblingListingEntry[]>>();
	return (dirPath: string) => {
		const key = siblingPathKey(dirPath);
		const existing = inflight.get(key);
		if (existing) {
			return existing;
		}
		const pending = service
			.listDirectory(dirPath)
			.then((rows) => rows as readonly SiblingListingEntry[]);
		inflight.set(key, pending);
		void pending.finally(() => {
			inflight.delete(key);
		});
		return pending;
	};
};

let sharedLister: SiblingListDirectory | undefined;
let sharedListerWindow: Window | undefined;

/**
 * Process-wide lister shared by every preset-glyph surface so sibling
 * lookups dedupe directory reads across tiles, list rows and cards. The
 * CEP panel runs in a single window, so keying on the window is enough.
 */
export const getSharedSiblingListDirectory = (
	win: Window,
): SiblingListDirectory | undefined => {
	if (sharedLister && sharedListerWindow === win) {
		return sharedLister;
	}
	sharedLister = createSiblingListDirectory(win);
	sharedListerWindow = win;
	return sharedLister;
};

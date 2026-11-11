import {
	copyDirectoryRecursive,
	pathExistsOnDisk,
} from "@/management/setting/persistence/copy-directory-recursive";
import { assertSafeDirectoryCopy } from "@/management/setting/persistence/path-copy-safety";
import { resolveManagedRoot } from "@/management/storage/file";

const joinFsPath = (...parts: string[]): string => {
	const normalized: string[] = [];
	for (const part of parts) {
		const v = part.trim().replace(/\\/g, "/").replace(/\/+$/, "");
		if (v.length > 0) normalized.push(v);
	}
	return normalized.join("/");
};

export type RelocateSupportRootInput = {
	fromSupportRoot: string;
	toSupportRoot: string;
};

/**
 * Copies the managed `ty-plus` tree and legacy `data` folder when Support Root changes.
 */
export const relocateTyPlusSupportData = async (
	win: Window,
	input: RelocateSupportRootInput,
): Promise<void> => {
	const fromBrowse = input.fromSupportRoot.trim();
	const toBrowse = input.toSupportRoot.trim();
	if (!fromBrowse || !toBrowse || fromBrowse === toBrowse) {
		return;
	}

	const fromManaged = resolveManagedRoot(fromBrowse);
	const toManaged = resolveManagedRoot(toBrowse);
	assertSafeDirectoryCopy(fromManaged, toManaged);

	if (await pathExistsOnDisk(win, fromManaged)) {
		await copyDirectoryRecursive(win, fromManaged, toManaged);
	}

	const fromData = joinFsPath(fromBrowse, "data");
	const toData = joinFsPath(toBrowse, "data");
	assertSafeDirectoryCopy(fromData, toData);
	if (await pathExistsOnDisk(win, fromData)) {
		await copyDirectoryRecursive(win, fromData, toData);
	}
};

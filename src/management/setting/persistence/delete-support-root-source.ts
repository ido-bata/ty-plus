import {
	pathExistsOnDisk,
	removeDirectoryRecursiveWithElevation,
} from "@/management/setting/persistence/copy-directory-recursive";
import { assertSafeSupportRootDelete } from "@/management/setting/persistence/path-copy-safety";
import { resolveManagedRoot } from "@/management/storage/file";

const joinFsPath = (...parts: string[]): string => {
	const normalized: string[] = [];
	for (const part of parts) {
		const v = part.trim().replace(/\\/g, "/").replace(/\/+$/, "");
		if (v.length > 0) normalized.push(v);
	}
	return normalized.join("/");
};

const readCepNodeProcessEnv = (
	win: Window,
): Record<string, string | undefined> | null => {
	const maybe = win as Window & {
		cep_node?: { process?: { env?: Record<string, string | undefined> } };
	};
	return maybe.cep_node?.process?.env ?? null;
};

const resolveTrustedUserDataRoots = (win: Window): string[] => {
	const env = readCepNodeProcessEnv(win);
	if (!env) {
		return [];
	}
	const candidates = [
		env.USERPROFILE,
		env.HOME,
		env.APPDATA,
		env.LOCALAPPDATA,
		env.HOMEDRIVE ? `${env.HOMEDRIVE}${env.HOMEPATH ?? ""}` : undefined,
	];
	return candidates.reduce<string[]>((acc, c) => {
		const t = typeof c === "string" ? c.trim() : "";
		if (t) acc.push(t);
		return acc;
	}, []);
};

/**
 * Deletes copied source folders (`ty-plus` managed tree and legacy `data`) under the
 * previous browse support root. Does not remove the browse root itself.
 *
 * The target must be located under a trusted user-data root (the user's home,
 * Documents, AppData, etc.). This guards against a crafted Support Root pointing
 * outside the user-data tree, which the elevation helper would otherwise delete
 * recursively.
 */
export const deleteSupportRootRelocationSource = async (
	win: Window,
	fromSupportRoot: string,
): Promise<void> => {
	const fromBrowse = fromSupportRoot.trim();
	if (!fromBrowse) {
		return;
	}

	const trustedRoots = resolveTrustedUserDataRoots(win);
	assertSafeSupportRootDelete(fromBrowse, trustedRoots);
	const fromManaged = resolveManagedRoot(fromBrowse);
	assertSafeSupportRootDelete(fromManaged, trustedRoots);
	assertSafeSupportRootDelete(joinFsPath(fromBrowse, "data"), trustedRoots);

	if (await pathExistsOnDisk(win, fromManaged)) {
		await removeDirectoryRecursiveWithElevation(win, fromManaged);
	}

	const fromData = joinFsPath(fromBrowse, "data");
	if (await pathExistsOnDisk(win, fromData)) {
		await removeDirectoryRecursiveWithElevation(win, fromData);
	}
};

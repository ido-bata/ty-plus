/**
 * Host support root resolution for the managed ty-plus workspace (CEP gateway).
 * Used by workspace persistence, panel JSON I/O, and widget state paths.
 */

import { resolveCepFileSystemGateway } from "@/management/ae/cep/runtime";
import { resolveManagedRoot } from "@/management/storage/file";

const _resolveSupportRootFromLocatorJson = (
	userSupportRoot: string,
	locatorJson: string | null | undefined,
): string => {
	if (!locatorJson?.trim()) {
		return userSupportRoot;
	}
	try {
		const parsed = JSON.parse(locatorJson) as {
			supportRoot?: unknown;
		};
		if (
			parsed &&
			typeof parsed === "object" &&
			typeof parsed.supportRoot === "string" &&
			parsed.supportRoot.trim().length > 0
		) {
			return parsed.supportRoot.trim();
		}
	} catch {
		/* ignore malformed locator */
	}
	return userSupportRoot;
};

const resolveSettingsBaseRoots = (win: Window): string[] => {
	const gateway = resolveCepFileSystemGateway("AEFT", {
		cep:
			typeof win.CSInterface === "function"
				? new win.CSInterface()
				: win.__adobe_cep__,
	});
	const hostSupportRoot = gateway?.systemPaths.hostSupportRoot?.trim();
	if (!hostSupportRoot) {
		return [];
	}
	return [hostSupportRoot.replace(/[\\/]+$/, "")];
};

const resolveSettingsBaseRoot = (win: Window): string | null => {
	const roots = resolveSettingsBaseRoots(win);
	return roots[0] ?? null;
};

export const resolveSettingsRoot = (win: Window): string | null => {
	const root = resolveSettingsBaseRoot(win);
	return root ? resolveManagedRoot(root) : null;
};

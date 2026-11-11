/**
 * CEP host **application support** path discovery (where `ty-plus-init.json` is stored).
 * This is unrelated to the onboarding-chosen `core.paths.supportRoot` in settings.json.
 */

import { resolveManagedRoot as resolveManagedRootFn } from "@/management/storage/file";

const isValidSupportRoot = (
	value: string | null | undefined,
): value is string => {
	const trimmed = value?.trim();
	if (!trimmed) return false;
	if (/^invalid input params$/i.test(trimmed)) return false;
	return /[\\/]|\w:/.test(trimmed);
};

/**
 * Resolves the support root from a CEP window.
 * Tries __adobe_cep__ first, then CSInterface.
 */
export const resolveSupportRootFromWindow = (win: Window): string | null => {
	const cepWindow = win as Window & {
		CSInterface?: new () => {
			getSystemPath?: (pathId: string) => string;
		};
		__adobe_cep__?: {
			getSystemPath?: (pathId: string) => string;
		};
	};

	if (cepWindow.__adobe_cep__?.getSystemPath) {
		try {
			const path = cepWindow.__adobe_cep__.getSystemPath("support");
			if (isValidSupportRoot(path)) return path.trim();
		} catch {
			/* fall through */
		}
	}

	if (typeof cepWindow.CSInterface !== "undefined") {
		try {
			const cs = new cepWindow.CSInterface();
			if (cs.getSystemPath) {
				const path = cs.getSystemPath("support");
				if (isValidSupportRoot(path)) return path.trim();
			}
		} catch {
			/* fall through */
		}
	}

	return null;
};

/**
 * Returns the managed root for a given base root.
 * @param baseRoot - The base support root
 * @param managedFolderName - The managed folder name (e.g., "ty-plus")
 */
const resolveManagedRoot = (
	baseRoot: string,
	managedFolderName: string,
): string => {
	const resolvedBase = resolveManagedRootFn(baseRoot);
	// If the managedFolderName is "ty-plus" (the default), the file-management version already handles it
	// For other folder names, we need to adjust
	if (managedFolderName === "ty-plus") {
		return resolvedBase;
	}
	// For custom folder names, construct the path manually
	const normalized = baseRoot.replace(/[\\/]+$/, "");
	return `${normalized}/${managedFolderName}`;
};

/**
 * Resolves the managed root from a CEP window.
 */
const resolveManagedRootFromWindow = (
	win: Window,
	managedFolderName: string,
): string | null => {
	const baseRoot = resolveSupportRootFromWindow(win);
	if (!baseRoot) return null;
	return resolveManagedRoot(baseRoot, managedFolderName);
};

/**
 * Resolves all support roots from a CEP window.
 * Returns array with host support root if available.
 */
const resolveSupportRootsFromWindow = (win: Window): string[] => {
	const base = resolveSupportRootFromWindow(win);
	return base ? [base] : [];
};

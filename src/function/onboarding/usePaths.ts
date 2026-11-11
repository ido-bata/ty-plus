import type { FilePickStep } from "@/function/onboarding/steps-data";
import type { PresetIcon } from "@/management/preset/contract";
import { resolveInitializationAppRoot } from "@/management/setting/onboarding/initialization";
import { normalizePathKey, normalizePathLike } from "@/shared/util/path";

export { normalizePathLike };

export type Paths = {
	presetRoot: string;
	scriptRoot: string;
	pluginRoot: string;
};

export type FolderEntry = {
	path: string;
	name: string;
	isDirectory: boolean;
	isPackage?: boolean;
	icon?: PresetIcon;
	fileType?: string;
	extension?: string;
	previewUrl?: string;
};

export function deriveSubfolders(supportRoot: string): Paths {
	const base = supportRoot.trim().replace(/[\\/]+$/, "");
	if (!base) {
		return { presetRoot: "", scriptRoot: "", pluginRoot: "" };
	}
	const sep = base.includes("\\") ? "\\" : "/";
	return {
		presetRoot: `${base}${sep}Presets`,
		scriptRoot: `${base}${sep}Scripts`,
		pluginRoot: `${base}${sep}Plug-ins`,
	};
}

export function resolveCurrentFolderPath(
	kind: FilePickStep,
	currentDir: Record<FilePickStep, string>,
	paths: Paths,
): string {
	if (currentDir[kind]) {
		return currentDir[kind];
	}
	if (kind === "presets") {
		return paths.presetRoot;
	}
	if (kind === "scripts") {
		return paths.scriptRoot;
	}
	return paths.pluginRoot;
}

/**
 * Check if the given path equals the running AE install folder (Support Files on Windows).
 */
export const isPathAeAppFolder = async (
	win: Window,
	path: string,
): Promise<boolean> => {
	const aeInstallFolder = await resolveInitializationAppRoot(win);
	if (!aeInstallFolder) {
		return false;
	}
	const normalizedInput = normalizePathKey(path);
	const normalizedAeInstall = normalizePathKey(aeInstallFolder);
	return normalizedInput === normalizedAeInstall;
};

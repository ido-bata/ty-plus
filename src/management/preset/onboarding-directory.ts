import type { FilePickStep } from "@/function/onboarding/steps-data";
import type { PresetType } from "@/management/preset/contract";
import { coercePersistedPresetIcon } from "@/management/preset/icon-data";
import { readScopedDirectory } from "@/management/storage/read/scoped-directory";
import type { DirectoryBrowserEntry } from "@/management/storage/ui/DirectoryBrowser";

export type OnboardingDirectoryReadOptions = {
	win: Window;
	kind: FilePickStep;
	rootPath: string;
	dirPath: string;
	allowedExtensions: readonly string[];
};

const presetTypeForStep = (kind: FilePickStep): PresetType =>
	kind === "scripts" ? "script" : kind === "plugins" ? "plugin" : "preset";

export const readOnboardingPresetDirectory = async ({
	win,
	kind,
	rootPath,
	dirPath,
	allowedExtensions,
}: OnboardingDirectoryReadOptions): Promise<DirectoryBrowserEntry[]> => {
	const presetType = presetTypeForStep(kind);
	const icon = coercePersistedPresetIcon(presetType, undefined);
	const rows = await readScopedDirectory({
		win,
		rootPath,
		dirPath,
		allowedExtensions,
		includeCompanionImages: true,
	});
	return rows.map((entry) => ({
		path: entry.path,
		name: entry.name,
		isDirectory: entry.isDirectory,
		...(entry.isPackage ? { isPackage: entry.isPackage } : {}),
		fileType: entry.fileType,
		extension: entry.extension,
		...(entry.isDirectory ? {} : { icon }),
	}));
};

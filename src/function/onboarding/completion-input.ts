import type {
	OnboardingFileBrowserEntry,
	OnboardingPresetCandidate,
} from "../../management/preset/onboarding-import";
import {
	collectFilePresetCandidates,
	collectFilePresetCandidatesWithScannedFolders,
	type OnboardingSelectedFiles,
} from "../../management/preset/onboarding-import";
import type { FilePickStep } from "./steps-data";

type Subfolders = {
	presetRoot: string;
	scriptRoot: string;
	pluginRoot: string;
};

export type CompletionInput = {
	locale: string;
	supportRoot: string;
	subfolders: Subfolders;
	selectedFiles: OnboardingSelectedFiles;
	selectedFolders: Record<FilePickStep, Set<string>>;
	canScanFolders: boolean;
};

export type ListDirectoryFn = (
	dirPath: string,
) => Promise<OnboardingFileBrowserEntry[]>;

export const buildSelectedFolderPaths = (
	selectedFolders: Record<FilePickStep, Set<string>>,
): Set<string> => {
	const selectedFolderPaths = new Set<string>();
	for (const key of ["presets", "scripts", "plugins"] as const) {
		for (const path of selectedFolders[key]) {
			selectedFolderPaths.add(path);
		}
	}
	return selectedFolderPaths;
};

export const buildPresetCandidates = async (
	input: CompletionInput,
	listDirectory: ListDirectoryFn,
): Promise<OnboardingPresetCandidate[]> => {
	const selectedFolderPaths = buildSelectedFolderPaths(input.selectedFolders);
	const hasSelectedFolders = selectedFolderPaths.size > 0;
	const scannedFiles: OnboardingSelectedFiles = {
		...input.selectedFiles,
		folders: selectedFolderPaths,
	};

	if (hasSelectedFolders && input.canScanFolders) {
		return collectFilePresetCandidatesWithScannedFolders(
			{
				selectedFiles: scannedFiles,
				selectedFolders: input.selectedFolders,
			},
			listDirectory,
		);
	}
	return collectFilePresetCandidates({
		...input.selectedFiles,
		folders: selectedFolderPaths,
	});
};

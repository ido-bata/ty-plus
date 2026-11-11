import { useEffect, useState } from "react";
import { STEP_EXTENSIONS } from "@/function/onboarding/file-extensions-data";
import type { FilePickStep } from "@/function/onboarding/steps-data";
import type { FolderEntry, Paths } from "@/function/onboarding/usePaths";
import { resolveCurrentFolderPath } from "@/function/onboarding/usePaths";
import { readOnboardingPresetDirectory } from "@/management/preset/onboarding-directory";
import {
	canUseCepNodeFileBrowser,
	createCepNodeFileBrowserService,
} from "@/management/storage/file-browser-service";

const rootPathForStep = (kind: FilePickStep, paths: Paths): string => {
	if (kind === "presets") return paths.presetRoot;
	if (kind === "scripts") return paths.scriptRoot;
	return paths.pluginRoot;
};

export function useFileBrowser(
	currentFileStep: FilePickStep | null,
	currentDir: Record<FilePickStep, string>,
	paths: Paths,
	setError: (err: string | null) => void,
) {
	const [folderEntries, setFolderEntries] = useState<FolderEntry[]>([]);
	const [loadingFiles, setLoadingFiles] = useState(false);
	const [refreshTick, setRefreshTick] = useState(0);

	useEffect(() => {
		const handleRefresh = () => {
			setRefreshTick((prev) => prev + 1);
		};
		window.addEventListener("browser-refresh", handleRefresh);
		return () => {
			window.removeEventListener("browser-refresh", handleRefresh);
		};
	}, []);

	useEffect(() => {
		if (!currentFileStep) {
			return;
		}
		const refreshMarker = refreshTick;
		if (refreshMarker < 0) {
			return;
		}
		if (!canUseCepNodeFileBrowser(window)) {
			setFolderEntries([]);
			return;
		}
		const service = createCepNodeFileBrowserService({ win: window });
		const rootPath = rootPathForStep(currentFileStep, paths);
		const initial =
			resolveCurrentFolderPath(currentFileStep, currentDir, paths) ||
			rootPath ||
			service.getDefaultDirectory();
		setLoadingFiles(true);
		setError(null);
		readOnboardingPresetDirectory({
			win: window,
			kind: currentFileStep,
			rootPath,
			dirPath: initial,
			allowedExtensions: STEP_EXTENSIONS[currentFileStep],
		})
			.then((entries) => {
				setFolderEntries(
					entries.map((e) => ({
						path: e.path,
						name: e.name,
						isDirectory: e.isDirectory,
						...(e.isPackage ? { isPackage: e.isPackage } : {}),
						...(e.icon ? { icon: e.icon } : {}),
						fileType: e.fileType,
						extension: e.extension,
						...(e.previewUrl && { previewUrl: e.previewUrl }),
					})),
				);
			})
			.catch((err) => {
				setError(err instanceof Error ? err.message : String(err));
				setFolderEntries([]);
			})
			.finally(() => setLoadingFiles(false));
	}, [currentFileStep, currentDir, paths, refreshTick, setError]);

	return {
		folderEntries,
		loadingFiles,
		refresh: () => {
			setRefreshTick((prev) => prev + 1);
		},
	};
}

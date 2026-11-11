import { useEffect } from "react";
import { useCep } from "@/management/ae/cep/contexts/Context";
import {
	installCepJsonContextMenuRewrite,
	registerCepJsonContextMenuSurface,
} from "@/management/dialog/dialogs/context-menu";
import {
	buildDirectoryBrowserMenu,
	handleDirectoryBrowserMenuSelect,
	parseDirectoryBrowserMenuHit,
} from "@/management/storage/ui/DirectoryBrowserMenu";

export function useMenu({
	onNext,
	onBack,
	canGoUp,
	isFileSelected,
	isFolderSelected,
	onRefreshBrowser,
	onGoUpBrowser,
	onOpenBrowserEntry,
	onToggleBrowserFile,
	onToggleBrowserFolder,
}: {
	onNext: () => void;
	onBack: () => void;
	canGoUp: boolean;
	isFileSelected: (path: string) => boolean;
	isFolderSelected: (path: string) => boolean;
	onRefreshBrowser: () => void;
	onGoUpBrowser: () => void;
	onOpenBrowserEntry: (path: string) => void;
	onToggleBrowserFile: (path: string) => void;
	onToggleBrowserFolder: (path: string) => void;
}) {
	const { panelSurfaceId } = useCep();

	useEffect(() => {
		const surfaceId = panelSurfaceId || "onboarding";
		const onboardingMenu = {
			menu: [
				{ id: "ty.onboarding.next", label: "Next" },
				{ id: "ty.onboarding.back", label: "Back" },
				{ id: "ty.onboarding.refresh", label: "Refresh" },
				{ id: "ty.onboarding.divider1", label: "---" },
				{ id: "ty.onboarding.openManual", label: "Open Manual" },
			],
		};
		const handleSelect = (menuId: string) => {
			if (menuId === "ty.onboarding.next") {
				onNext();
			} else if (menuId === "ty.onboarding.back") {
				onBack();
			}
		};
		const unregisterSurface = registerCepJsonContextMenuSurface(surfaceId, {
			buildPayload: (event) => {
				const target = event.target;
				const el = target instanceof Element ? target : null;
				const hit = parseDirectoryBrowserMenuHit(el);
				if (!hit) {
					return onboardingMenu;
				}
				return buildDirectoryBrowserMenu(
					{
						surface: "onboarding",
						selectionMode: "both",
						isSelected: (path, kind) =>
							kind === "file" ? isFileSelected(path) : isFolderSelected(path),
						canGoUp,
						canRefresh: true,
					},
					hit,
				);
			},
			onMenuSelect: (menuId) => {
				handleDirectoryBrowserMenuSelect(
					menuId,
					{
						surface: "onboarding",
						selectionMode: "both",
						isSelected: (path, kind) =>
							kind === "file" ? isFileSelected(path) : isFolderSelected(path),
						canGoUp,
						canRefresh: true,
					},
					{
						onRefresh: onRefreshBrowser,
						onGoUp: onGoUpBrowser,
						onOpenEntry: onOpenBrowserEntry,
						onToggleSelected: (path, kind) => {
							if (kind === "folder") {
								onToggleBrowserFolder(path);
							} else {
								onToggleBrowserFile(path);
							}
						},
					},
				);
			},
		});
		const uninstall = installCepJsonContextMenuRewrite(
			window,
			surfaceId,
			onboardingMenu,
			handleSelect,
		);
		return () => {
			unregisterSurface();
			uninstall();
		};
	}, [
		panelSurfaceId,
		onNext,
		onBack,
		canGoUp,
		isFileSelected,
		isFolderSelected,
		onRefreshBrowser,
		onGoUpBrowser,
		onOpenBrowserEntry,
		onToggleBrowserFile,
		onToggleBrowserFolder,
	]);
}
